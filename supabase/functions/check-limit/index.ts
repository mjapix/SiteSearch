import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, x-admin-token, x-client-id",
};

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

const DAILY_SCAN_LIMIT = 4;

async function getIdentifier(req: Request): Promise<string> {
  const clientId = req.headers.get("x-client-id");
  if (clientId && clientId.length > 8) {
    return `client:${clientId}`;
  }
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0] ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + "salt-for-privacy-preview");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return `ip:${hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: { ...corsHeaders, ...securityHeaders } });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const adminToken = req.headers.get("x-admin-token");
    const adminSecret = Deno.env.get("ADMIN_SECRET");
    const isAdmin = adminSecret && adminToken === adminSecret;

    if (isAdmin) {
      return new Response(
        JSON.stringify({ remainingScans: 999, isAdmin: true }),
        { headers: { ...corsHeaders, ...securityHeaders, "Content-Type": "application/json" } }
      );
    }

    const identifier = await getIdentifier(req);
    const clientId = req.headers.get("x-client-id");
    const isClientBased = clientId && clientId.length > 8;

    let usageData = null;
    if (isClientBased) {
      const { data } = await supabase
        .from("usage_limits")
        .select("*")
        .eq("client_id", clientId)
        .maybeSingle();
      usageData = data;
    } else {
      const ipHash = identifier.replace("ip:", "");
      const { data } = await supabase
        .from("usage_limits")
        .select("*")
        .eq("ip_hash", ipHash)
        .maybeSingle();
      usageData = data;
    }

    let remainingScans = DAILY_SCAN_LIMIT;

    if (usageData) {
      if (new Date(usageData.reset_at) <= new Date()) {
        remainingScans = DAILY_SCAN_LIMIT;
      } else {
        remainingScans = Math.max(0, DAILY_SCAN_LIMIT - usageData.scans_today);
      }
    }

    return new Response(
      JSON.stringify({ remainingScans, isAdmin: false }),
      { headers: { ...corsHeaders, ...securityHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("check-limit error:", error);
    return new Response(
      JSON.stringify({ error: "Limit-Abfrage fehlgeschlagen" }),
      {
        status: 500,
        headers: { ...corsHeaders, ...securityHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
