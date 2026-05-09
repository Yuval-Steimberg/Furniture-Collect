// weekly-digest — sends a weekly progress email to each Project Manager.
// Trigger with pg_cron: SELECT cron.schedule('weekly-digest', '0 8 * * 1', $$SELECT net.http_post(...)$$);
// Or call manually: supabase functions invoke weekly-digest

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "noreply@furnicollect.app";

interface ProjectDigest {
  project_id: string;
  project_name: string;
  city: string;
  total_apartments: number;
  completed_apartments: number;
  total_items: number;
  collected_items: number;
  pending_items: number;
  diverted_kg: number;
  this_week_collected: number;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Get all project managers with email
    const { data: managers, error: mgErr } = await supabase
      .from("profiles")
      .select("id, name, email")
      .eq("org_role", "PROJECT_MANAGER")
      .eq("is_active", true);

    if (mgErr) throw mgErr;
    if (!managers?.length) return new Response(JSON.stringify({ sent: 0 }), { headers: corsHeaders });

    let sent = 0;
    const errors: string[] = [];

    for (const manager of managers) {
      try {
        // Projects this manager is on
        const { data: userProjects } = await supabase
          .from("user_projects")
          .select("project_id")
          .eq("user_id", manager.id)
          .in("project_role", ["PROJECT_MANAGER", "ORG_ADMIN"]);

        const projectIds = (userProjects ?? []).map((p: any) => p.project_id);
        if (!projectIds.length) continue;

        // Load data for each project
        const [{ data: projects }, { data: apts }, { data: items }, { data: thisWeekItems }] = await Promise.all([
          supabase.from("projects").select("id,name,city").in("id", projectIds),
          supabase.from("apartments").select("id,project_id,status").in("project_id", projectIds),
          supabase.from("items").select("id,project_id,quantity,collected,intended_for_collection,estimated_weight_kg").in("project_id", projectIds),
          supabase.from("items").select("id,project_id,quantity,collected").in("project_id", projectIds)
            .eq("collected", true).gte("updated_at", oneWeekAgo),
        ]);

        const digests: ProjectDigest[] = (projects ?? []).map((proj: any) => {
          const projApts = (apts ?? []).filter((a: any) => a.project_id === proj.id);
          const projItems = (items ?? []).filter((i: any) => i.project_id === proj.id);
          const weekItems = (thisWeekItems ?? []).filter((i: any) => i.project_id === proj.id);
          const forCollection = projItems.filter((i: any) => i.intended_for_collection);
          const diverted = projItems.filter((i: any) => i.collected)
            .reduce((s: number, i: any) => s + ((i.estimated_weight_kg ?? 0) * (i.quantity ?? 1)), 0);

          return {
            project_id: proj.id,
            project_name: proj.name,
            city: proj.city,
            total_apartments: projApts.length,
            completed_apartments: projApts.filter((a: any) => a.status === "COMPLETED").length,
            total_items: projItems.reduce((s: number, i: any) => s + (i.quantity ?? 1), 0),
            collected_items: projItems.filter((i: any) => i.collected).reduce((s: number, i: any) => s + (i.quantity ?? 1), 0),
            pending_items: forCollection.filter((i: any) => !i.collected).reduce((s: number, i: any) => s + (i.quantity ?? 1), 0),
            diverted_kg: Math.round(diverted),
            this_week_collected: weekItems.reduce((s: number, i: any) => s + (i.quantity ?? 1), 0),
          };
        });

        if (!digests.length) continue;

        const html = buildEmailHtml(manager.name, digests, oneWeekAgo);
        const totalWeekItems = digests.reduce((s, d) => s + d.this_week_collected, 0);
        const subject = `סיכום שבועי FurniCollect — ${totalWeekItems} פריטים נאספו השבוע`;

        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: [manager.email],
            subject,
            html,
          }),
        });

        if (!res.ok) {
          const err = await res.text();
          errors.push(`${manager.email}: ${err}`);
        } else {
          sent++;
        }
      } catch (err: any) {
        errors.push(`${manager.email}: ${err.message}`);
      }
    }

    return new Response(
      JSON.stringify({ sent, errors: errors.length ? errors : undefined }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function buildEmailHtml(managerName: string, digests: ProjectDigest[], since: string): string {
  const sinceDate = new Date(since).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
  const today = new Date().toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });

  const projectRows = digests.map(d => {
    const pct = d.total_items > 0 ? Math.round((d.collected_items / d.total_items) * 100) : 0;
    const aptPct = d.total_apartments > 0 ? Math.round((d.completed_apartments / d.total_apartments) * 100) : 0;
    return `
      <tr>
        <td style="padding:12px 8px;border-bottom:1px solid #e5e7eb;font-weight:600">${d.project_name}</td>
        <td style="padding:12px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280">${d.city}</td>
        <td style="padding:12px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${d.completed_apartments}/${d.total_apartments} (${aptPct}%)</td>
        <td style="padding:12px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${d.collected_items}/${d.total_items} (${pct}%)</td>
        <td style="padding:12px 8px;border-bottom:1px solid #e5e7eb;text-align:center;color:${d.this_week_collected > 0 ? '#16a34a' : '#6b7280'};font-weight:${d.this_week_collected > 0 ? '700' : '400'}">${d.this_week_collected}</td>
        <td style="padding:12px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${d.diverted_kg.toLocaleString()} ק"ג</td>
      </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif;direction:rtl">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;margin-top:24px;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
    <div style="background:linear-gradient(135deg,#1d4ed8,#2563eb);padding:32px;color:#fff;text-align:right">
      <div style="font-size:24px;font-weight:800;margin-bottom:4px">FurniCollect</div>
      <div style="font-size:16px;opacity:0.85">סיכום שבועי · ${sinceDate}–${today}</div>
    </div>
    <div style="padding:24px">
      <p style="margin:0 0 20px;font-size:16px">שלום ${managerName},</p>
      <p style="margin:0 0 24px;color:#6b7280">להלן סיכום הפעילות בפרויקטים שלך השבוע:</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead>
          <tr style="background:#f3f4f6">
            <th style="padding:10px 8px;text-align:right;color:#374151">פרויקט</th>
            <th style="padding:10px 8px;text-align:right;color:#374151">עיר</th>
            <th style="padding:10px 8px;text-align:center;color:#374151">דירות</th>
            <th style="padding:10px 8px;text-align:center;color:#374151">פריטים</th>
            <th style="padding:10px 8px;text-align:center;color:#374151">השבוע</th>
            <th style="padding:10px 8px;text-align:center;color:#374151">ק"ג הוסטו</th>
          </tr>
        </thead>
        <tbody>${projectRows}</tbody>
      </table>
      <div style="margin-top:24px;padding:16px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0">
        <div style="font-size:13px;color:#166534">💚 המערכת ממשיכה לחסוך CO₂ ולסייע בניהול פינוי ריהוט בצורה חכמה יותר.</div>
      </div>
    </div>
    <div style="padding:16px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center">
      <a href="${SUPABASE_URL?.replace('supabase.co', 'furnicollect.app') ?? '#'}" style="color:#2563eb;text-decoration:none;font-size:13px">פתח את FurniCollect</a>
      <span style="color:#d1d5db;margin:0 8px">·</span>
      <span style="color:#9ca3af;font-size:13px">הסר הרשמה</span>
    </div>
  </div>
</body>
</html>`;
}
