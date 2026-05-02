import { env } from "./env";
import { getBearerToken, sendJson } from "./http";
import { getAuthenticatedUser } from "./supabase";

export async function requireAuthenticatedUser(req: any, res: any) {
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

export async function authorizeSyncRequest(req: any, res: any) {
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

export function getUserEntitlements(user: any) {
  return {
    isPro: user?.app_metadata?.is_pro === true,
  };
}
