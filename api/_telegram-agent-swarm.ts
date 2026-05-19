type TelegramPick = {
  candidateId?: string;
  rank?: number;
  displayName?: string;
  xHandle?: string;
  overview?: string;
  confidence?: number;
  context?: string[];
  detailUrl?: string;
};

type TelegramSendResult = {
  ok?: boolean;
  description?: string;
};

type TelegramUpdatesResult = {
  ok?: boolean;
  description?: string;
  result?: Array<{ message?: { chat?: { id?: number | string } } }>;
};

export function cleanText(value: unknown, fallback = "") {
  return String(value || fallback)
    .replace(/[<>]/g, "")
    .slice(0, 500);
}

function escapeHtml(value: unknown, fallback = "") {
  return cleanText(value, fallback)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;");
}

export function absoluteBaseUrl(req: any) {
  const configuredUrl = process.env.TRAQR_PUBLIC_SITE_URL || process.env.VITE_SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (configuredUrl) {
    const url = configuredUrl.startsWith("http") ? configuredUrl : `https://${configuredUrl}`;
    return url.replace(/\/$/, "");
  }
  const proto = String(req.headers?.["x-forwarded-proto"] || "https").split(",")[0];
  const host = String(req.headers?.["x-forwarded-host"] || req.headers?.host || "traqr.ai").split(",")[0];
  return `${proto}://${host}`;
}

function pickDetailUrl(pick: TelegramPick, index: number, baseUrl: string) {
  if (pick.detailUrl) return pick.detailUrl;
  const id = pick.candidateId || `${pick.rank || index + 1}`;
  return `${baseUrl}/agent-swarm?pick=${encodeURIComponent(id)}`;
}

function xProfileUrl(handle?: string) {
  const cleanHandle = handle?.replace(/^@/, "").trim();
  return cleanHandle ? `https://x.com/${encodeURIComponent(cleanHandle)}` : "";
}

export function formatMessage(picks: TelegramPick[], baseUrl: string) {
  const rows = picks.slice(0, 5).map((pick, index) => {
    const rank = typeof pick.rank === "number" ? pick.rank : index + 1;
    const handle = pick.xHandle ? ` ${escapeHtml(pick.xHandle)}` : "";
    const url = pickDetailUrl(pick, index, baseUrl);
    const name = escapeHtml(pick.displayName, "Founder pick");
    const overview = escapeHtml(pick.overview);
    return `#${rank} <a href="${escapeHtml(url)}">${name}</a>${handle}\n${overview}`;
  });
  return `<b>traqr.ai Agent Swarm - Founder Top Picks</b>\n\n${rows.join("\n\n")}\n\nTippe auf einen Namen oder Button, um die Details zu oeffnen.`;
}

export function inlineKeyboard(picks: TelegramPick[], baseUrl: string) {
  return picks.slice(0, 5).map((pick, index) => {
    const name = cleanText(pick.displayName, "Founder pick").slice(0, 22);
    const detailButton = {
      text: `Details: ${name}`,
      url: pickDetailUrl(pick, index, baseUrl),
    };
    const xUrl = xProfileUrl(pick.xHandle);
    return xUrl ? [detailButton, { text: "X", url: xUrl }] : [detailButton];
  });
}

export async function resolveChatId(token: string) {
  if (process.env.TELEGRAM_CHAT_ID) return process.env.TELEGRAM_CHAT_ID;
  const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
  const payload = (await response.json()) as TelegramUpdatesResult;
  if (!response.ok || payload.ok === false) {
    const detail = payload.description || "Telegram getUpdates failed.";
    if (detail.toLowerCase().includes("webhook")) {
      throw new Error("Telegram webhook is active, so getUpdates cannot discover a chat id. Set TELEGRAM_CHAT_ID or use the chat-triggered webhook demo.");
    }
    throw new Error(detail);
  }
  const chatId = payload.result?.slice().reverse().find((entry) => entry.message?.chat?.id)?.message?.chat?.id;
  return chatId ? String(chatId) : "";
}

export async function sendTelegramTopPicks(token: string, chatId: string, picks: TelegramPick[], baseUrl: string) {
  const telegramResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: formatMessage(picks, baseUrl),
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: inlineKeyboard(picks, baseUrl),
      },
      disable_web_page_preview: true,
    }),
  });
  const telegramPayload = (await telegramResponse.json()) as TelegramSendResult;
  if (!telegramResponse.ok || telegramPayload.ok === false) {
    throw new Error(telegramPayload.description || "Telegram send failed.");
  }
}

export async function sendTelegramText(token: string, chatId: string, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });
}

export async function sendTyping(token: string, chatId: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      action: "typing",
    }),
  });
}

export function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type { TelegramPick };
