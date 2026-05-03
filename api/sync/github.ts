import { authorizeSyncRequest } from "../_lib/auth.js";
import { sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import { syncGithubSignals } from "../_lib/github-sync.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { ok: false, error: "Method not allowed." });
  }

  const auth = await authorizeSyncRequest(req, res);
  if (!auth) return;

  try {
    const result = await syncGithubSignals();
    return sendJson(res, 200, result);
  } catch (error) {
    return sendJson(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
