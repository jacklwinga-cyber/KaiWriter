import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  CONFIRM_PHRASE,
  DELETE_ACCOUNT_MESSAGES,
  DELETE_ACCOUNT_STATUS,
  type DeleteAccountErrorCode,
  hasBillableSubscription,
  needsReauth,
} from "../_shared/accountCore.ts";

// Deletes the signed-in user's account. Every KaiWriter table references
// auth.users ON DELETE CASCADE, so deleting the auth user removes their
// documents, folders, comments, dictionary, usage and subscription rows.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fail(code: DeleteAccountErrorCode): Response {
  // Codes only: never user ids, emails or tokens.
  console.error(`[delete-account] ${code}`);
  return json({ error: { code, message: DELETE_ACCOUNT_MESSAGES[code] } }, DELETE_ACCOUNT_STATUS[code]);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("bad_request");
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return fail("unauthorized");

  let confirm: unknown;
  try {
    confirm = ((await req.json()) as { confirm?: unknown }).confirm;
  } catch {
    return fail("bad_request");
  }
  if (confirm !== CONFIRM_PHRASE) return fail("bad_request");

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) return fail("not_configured");

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  const user = userData?.user;
  if (userError || !user) return fail("unauthorized");
  if (needsReauth(user.last_sign_in_at, Date.now())) return fail("reauth_required");

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: sub, error: subError } = await admin
    .from("kaiwriter_subscriptions")
    .select("status, stripe_subscription_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (subError) return fail("failed");
  if (hasBillableSubscription(sub)) return fail("subscription_active");

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) return fail("failed");
  console.log("[delete-account] deleted");
  return json({ deleted: true });
});
