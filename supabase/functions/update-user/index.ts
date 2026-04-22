// update-user — admin-side edits on a profile: name, title, org_role,
// is_active (suspend/reactivate). Deliberately does NOT change email
// (that's tied to auth.users and needs a different admin call).
//
// Input: {
//   user_id: string,
//   updates: {
//     name?: string,
//     title?: string | null,
//     org_role?: 'ORG_ADMIN' | 'PROJECT_MANAGER' | 'WORKER',
//     is_active?: boolean,
//   },
// }
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ORG_ROLES = new Set(["ORG_ADMIN", "PROJECT_MANAGER", "WORKER"]);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { user_id, updates } = await req.json();
    if (!user_id || !updates || typeof updates !== "object") return err(400, "user_id + updates required");

    const patch: Record<string, unknown> = {};
    if (typeof updates.name === "string")      patch.name = updates.name.slice(0, 120);
    if (updates.title === null || typeof updates.title === "string") patch.title = updates.title?.slice(0, 80) ?? null;
    if (typeof updates.org_role === "string" && ORG_ROLES.has(updates.org_role)) patch.org_role = updates.org_role;
    if (typeof updates.is_active === "boolean") patch.is_active = updates.is_active;
    if (Object.keys(patch).length === 0) return err(400, "no valid updates");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE) return err(500, "supabase admin env missing");
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    const { data, error } = await admin.from("profiles").update(patch).eq("id", user_id).select().single();
    if (error) return err(400, `update failed: ${error.message}`);

    // If suspending, also revoke all active sessions so they're logged out.
    if (updates.is_active === false) {
      try {
        await admin.auth.admin.signOut(user_id);
      } catch (_e) { /* non-fatal */ }
    }

    return new Response(JSON.stringify({ profile: data }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("update-user crashed:", e);
    return err(500, e instanceof Error ? e.message : "unknown");
  }

  function err(status: number, message: string): Response {
    return new Response(JSON.stringify({ error: message }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
