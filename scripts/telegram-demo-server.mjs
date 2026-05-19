import http from "node:http";

const port = Number(process.env.PORT || 8788);
const token = process.env.TELEGRAM_BOT_TOKEN || "";
const configuredChatId = process.env.TELEGRAM_CHAT_ID || "";

function cleanText(value, fallback = "") {
  return String(value || fallback)
    .replace(/[<>]/g, "")
    .slice(0, 500);
}

function escapeHtml(value, fallback = "") {
  return cleanText(value, fallback)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;");
}

function absoluteBaseUrl(req) {
  const proto = String(req.headers["x-forwarded-proto"] || "http").split(",")[0];
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "45.77.65.57").split(",")[0];
  return `${proto}://${host}`;
}

function pickDetailUrl(pick, index, baseUrl) {
  const id = pick.candidateId || `${pick.rank || index + 1}`;
  return `${baseUrl}/agent-swarm?pick=${encodeURIComponent(id)}`;
}

function xProfileUrl(handle) {
  const cleanHandle = handle?.replace(/^@/, "").trim();
  return cleanHandle ? `https://x.com/${encodeURIComponent(cleanHandle)}` : "";
}

function formatMessage(picks, baseUrl) {
  const rows = picks.slice(0, 5).map((pick, index) => {
    const rank = typeof pick.rank === "number" ? pick.rank : index + 1;
    const handle = pick.xHandle ? ` ${escapeHtml(pick.xHandle)}` : "";
    const url = pickDetailUrl(pick, index, baseUrl);
    const name = escapeHtml(pick.displayName, "Founder pick");
    const overview = escapeHtml(pick.overview);
    return `#${rank} <a href="${escapeHtml(url)}">${name}</a>${handle}\n${overview}`;
  });
  return `<b>traqr.ai Agent Swarm - Founder Top Picks</b>\n\n${rows.join("\n\n")}\n\nTippe auf einen Namen oder Button, um die Details zu öffnen.`;
}

function inlineKeyboard(picks, baseUrl) {
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

async function resolveChatId() {
  if (configuredChatId) return configuredChatId;
  const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
  const payload = await response.json();
  const chatId = payload.result?.slice().reverse().find((entry) => entry.message?.chat?.id)?.message?.chat?.id;
  return chatId ? String(chatId) : "";
}

async function sendTelegramTopPicks(chatId, picks, baseUrl) {
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
  const telegramPayload = await telegramResponse.json();
  if (!telegramResponse.ok || telegramPayload.ok === false) {
    throw new Error(telegramPayload.description || "Telegram send failed.");
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 100_000) {
        req.destroy();
        reject(new Error("Request body too large."));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method !== "POST" || req.url !== "/api/agent-swarm-telegram") {
    sendJson(res, 404, { ok: false, error: "Not found." });
    return;
  }

  if (!token) {
    sendJson(res, 500, { ok: false, error: "Telegram bot token is not configured." });
    return;
  }

  try {
    const body = await readJson(req);
    const topPicks = Array.isArray(body.topPicks) ? body.topPicks.slice(0, 5) : [];
    if (!topPicks.length) {
      sendJson(res, 400, { ok: false, error: "No founder picks supplied." });
      return;
    }

    const chatId = await resolveChatId();
    if (!chatId) {
      sendJson(res, 409, { ok: false, error: "Open the Telegram bot once, then run the demo again." });
      return;
    }

    await sendTelegramTopPicks(chatId, topPicks, absoluteBaseUrl(req));
    sendJson(res, 200, { ok: true, message: "Top picks sent to Telegram." });
  } catch (error) {
    sendJson(res, 502, { ok: false, error: error instanceof Error ? error.message : "Telegram send failed." });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`telegram demo server listening on 127.0.0.1:${port}`);
});
