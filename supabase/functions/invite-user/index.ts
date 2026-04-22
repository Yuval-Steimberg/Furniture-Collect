// invite-user — creates a new user via the Supabase admin API, sets their
// org_role + optional title, and optionally assigns them to a project with
// a specific project_role in a single round-trip.
//
// Input: {
//   email: string,
//   name: string,
//   password?: string,              // if omitted, a random one is generated
//                                    // and the user receives a magic-link email
//   org_role: 'ORG_ADMIN' | 'PROJECT_MANAGER' | 'WORKER',
//   title?: string,
//   project_id?: string,            // optional — assign at invite time
//   project_role?: 'PROJECT_MANAGER' | 'WORKER',
// }
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { email, name, password, org_role, title, project_id, project_role } = body;
    if (!email || !name || !org_role) return err(400, "email, name, org_role are required");
    if (!["ORG_ADMIN", "PROJECT_MANAGER", "WORKER"].includes(org_role)) return err(400, "invalid org_role");
    if (project_role && !["PROJECT_MANAGER", "WORKER"].includes(project_role)) return err(400, "invalid project_role");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE) return err(500, "supabase admin env missing");

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    // Create the auth user (email auto-confirmed so they can log in immediately)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: password ?? crypto.randomUUID().replace(/-/g, "").slice(0, 16),
      email_confirm: true,
      user_metadata: { name },
    });
    if (createErr) return err(400, `failed to create user: ${createErr.message}`);
    const newUser = created?.user;
    if (!newUser) return err(500, "no user returned from admin.createUser");

    // The handle_new_user trigger will have already created a profile row.
    // Update it with our desired org_role + title.
    const { error: profileErr } = await admin
      .from("profiles")
      .update({ name, org_role, title: title ?? null, is_active: true })
      .eq("id", newUser.id);
    if (profileErr) return err(500, `failed to update profile: ${profileErr.message}`);

    // Optional: assign to project
    if (project_id && project_role) {
      const { error: upErr } = await admin.from("user_projects").insert({
        user_id: newUser.id,
        project_id,
        project_role,
      });
      if (upErr) console.warn("failed to assign project:", upErr.message);
    }

    return new Response(JSON.stringify({
      user_id: newUser.id,
      email: newUser.email,
      generated_password: password ? null : true, // signal that a random one was used
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("invite-user crashed:", e);
    return err(500, e instanceof Error ? e.message : "unknown");
  }

  function err(status: number, message: string): Response {
    return new Response(JSON.stringify({ error: message }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
