import { authorizeSyncRequest } from "../_lib/auth.js";
import { sendJson } from "../_lib/http.js";
import { syncXSignals } from "../_lib/x-sync.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { ok: false, error: "Method not allowed." });
  }

  const auth = await authorizeSyncRequest(req, res);
  if (!auth) return;

  try {
    const result = await syncXSignals();
    return sendJson(res, 200, result);
  } catch (error) {
    return sendJson(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
