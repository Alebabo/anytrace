import { createClient } from "@supabase/supabase-js";
import { env, requireEnv } from "./env";

export const supabaseAdmin = createClient(
  requireEnv("supabaseUrl"),
  requireEnv("supabaseServiceRoleKey"),
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

export async function getAuthenticatedUser(accessToken: string) {
  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data.user) {
    throw new Error("Unauthorized");
  }
  return data.user;
}

export async function setUserProState(userId: string, isPro: boolean) {
  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .update({ is_pro: isPro })
    .eq("id", userId);

  if (profileError) throw profileError;

  const {
    data: { user },
    error: getUserError,
  } = await supabaseAdmin.auth.admin.getUserById(userId);

  if (getUserError) throw getUserError;

  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    app_metadata: {
      ...(user?.app_metadata ?? {}),
      is_pro: isPro,
    },
  });

  if (authError) throw authError;
}

export function getSiteUrlFromRequest(req: any) {
  const forwardedHost = req.headers["x-forwarded-host"];
  const host = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost ?? req.headers.host;
  const protoHeader = req.headers["x-forwarded-proto"];
  const protocol = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader ?? "https";

  if (env.siteUrl) {
    if (env.siteUrl.startsWith("http")) return env.siteUrl;
    return `https://${env.siteUrl}`;
  }

  return `${protocol}://${host}`;
}
