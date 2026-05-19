import { absoluteBaseUrl } from "./_telegram-agent-swarm.js";
import type { ApiRequest, ApiResponse } from "./_telegram-agent-swarm.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed." });
    return;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    res.status(500).json({ ok: false, error: "Telegram bot token is not configured." });
    return;
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  if (body.confirm !== "agent-swarm") {
    res.status(403).json({ ok: false, error: "Missing confirmation." });
    return;
  }

  const webhookUrl = `${absoluteBaseUrl(req)}/api/agent-swarm-telegram-webhook`;
  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      drop_pending_updates: true,
      allowed_updates: ["message"],
    }),
  });
  const payload = (await response.json()) as { ok?: boolean; description?: string };
  if (!response.ok || payload.ok === false) {
    res.status(502).json({ ok: false, error: payload.description || "Telegram webhook registration failed." });
    return;
  }

  res.status(200).json({ ok: true, webhookUrl });
}
