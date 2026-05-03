import { env } from "./env.js";
import { getBearerToken, sendJson, type ApiRequest, type ApiResponse } from "./http.js";
import { getAuthenticatedUser } from "./supabase.js";

export async function requireAuthenticatedUser(req: ApiRequest, res: ApiResponse) {
  const token = getBearerToken(req);
  if (!token) {
    sendJson(res, 401, { ok: false, error: "Missing bearer token." });
    return null;
  }

  try {
    const user = await getAuthenticatedUser(token);
    return { user, token };
  } catch {
    sendJson(res, 401, { ok: false, error: "Invalid bearer token." });
    return null;
  }
}

export async function authorizeSyncRequest(req: ApiRequest, res: ApiResponse) {
  const cronHeader = req.headers["x-vercel-cron"];
  if (cronHeader) {
    return { kind: "cron" as const };
  }

  const suppliedSecret = req.headers["x-cron-secret"];
  if (env.cronSecret && suppliedSecret === env.cronSecret) {
    return { kind: "secret" as const };
  }

  const auth = await requireAuthenticatedUser(req, res);
  if (!auth) return null;
  return { kind: "user" as const, user: auth.user };
}

export function getUserEntitlements(user: { app_metadata?: Record<string, unknown> } | null | undefined) {
  return {
    isPro: user?.app_metadata?.is_pro === true,
  };
}
