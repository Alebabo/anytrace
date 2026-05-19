import { absoluteBaseUrl, resolveChatId, sendTelegramTopPicks } from "./_telegram-agent-swarm.js";
import type { ApiRequest, ApiResponse, TelegramPick } from "./_telegram-agent-swarm.js";

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
  const topPicks = Array.isArray(body.topPicks) ? body.topPicks.slice(0, 5) : [];
  if (!topPicks.length) {
    res.status(400).json({ ok: false, error: "No founder picks supplied." });
    return;
  }

  try {
    const chatId = await resolveChatId(token);
    if (!chatId) {
      res.status(409).json({ ok: false, error: "Open the Telegram bot once, then run the demo again." });
      return;
    }

    const baseUrl = absoluteBaseUrl(req);
    await sendTelegramTopPicks(token, chatId, topPicks, baseUrl);
  } catch (error) {
    res.status(502).json({ ok: false, error: error instanceof Error ? error.message : "Telegram send failed." });
    return;
  }

  res.status(200).json({ ok: true, message: "Top picks sent to Telegram." });
}
