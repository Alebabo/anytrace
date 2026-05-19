import { createRequire } from "node:module";
import {
  absoluteBaseUrl,
  sendTelegramText,
  sendTelegramTopPicks,
  sendTyping,
  wait,
  type TelegramPick,
} from "./_telegram-agent-swarm.js";
import type { ApiRequest, ApiResponse } from "./_telegram-agent-swarm.js";

const require = createRequire(import.meta.url);
const demoSeedData = require("../src/data/demoSeedData.json");

type TelegramUpdate = {
  message?: {
    text?: string;
    chat?: { id?: number | string };
    from?: { is_bot?: boolean };
  };
};

type DemoTriageResult = {
  candidateId?: string;
  rank?: number;
  displayName?: string;
  xHandle?: string;
  overview?: string;
  whyNow?: string;
  confidence?: number;
  category?: string;
  decision?: string;
  linkedinRoleTitle?: string;
  linkedinHeadline?: string;
  linkedinCompany?: string;
  linkedinLocation?: string;
  currentSeedFollowerCount?: number;
  githubContext?: {
    builderSignal?: string;
    topRepos?: Array<{
      repoLabel?: string;
      stars?: number;
      starDelta7d?: number;
    }>;
  };
};

type DemoSeedData = {
  triageRun?: {
    topPicks?: DemoTriageResult[];
    results?: DemoTriageResult[];
  };
};

function compactNumber(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, notation: "compact" })
    .format(value)
    .replace("K", "k")
    .replace("M", "m");
}

function uniqueRows(rows: string[]) {
  return [...new Set(rows.map((row) => row.trim()).filter(Boolean))];
}

function founderContextRows(pick: DemoTriageResult) {
  const repo = pick.githubContext?.topRepos?.[0];
  const repoStars = compactNumber(repo?.stars);
  const repoDelta = compactNumber(repo?.starDelta7d);
  const context = [
    pick.linkedinRoleTitle && pick.linkedinCompany && !pick.linkedinRoleTitle.includes(pick.linkedinCompany)
      ? `${pick.linkedinRoleTitle} at ${pick.linkedinCompany}`
      : pick.linkedinRoleTitle || pick.linkedinHeadline || pick.linkedinCompany || "",
    pick.linkedinLocation ? `Based in ${pick.linkedinLocation}` : "",
    repo?.repoLabel
      ? `${repo.repoLabel}${repoStars ? ` has ${repoStars} stars` : ""}${repoDelta ? `, +${repoDelta} in 7d` : ""}`
      : pick.githubContext?.builderSignal || "",
    pick.currentSeedFollowerCount ? `${pick.currentSeedFollowerCount} curated seed sources follow this profile` : "",
  ];
  return uniqueRows(context).slice(0, 3);
}

function isFounderPick(pick: DemoTriageResult) {
  const founderCategory =
    pick.category === "potential_founder" ||
    pick.category === "active_founder" ||
    pick.category === "company_no_raise_yet";
  const actionable = pick.decision === "reach_out_now" || pick.decision === "research_more";
  return founderCategory && actionable;
}

function demoTelegramPicks(): TelegramPick[] {
  const triageRun = (demoSeedData as DemoSeedData).triageRun || {};
  const rows = (triageRun.topPicks || triageRun.results || []) as DemoTriageResult[];
  return rows
    .filter(isFounderPick)
    .slice(0, 5)
    .map((pick) => ({
      candidateId: pick.candidateId,
      rank: pick.rank,
      displayName: pick.displayName,
      xHandle: pick.xHandle,
      overview: pick.overview || pick.whyNow,
      confidence: pick.confidence,
      context: founderContextRows(pick),
    }));
}

async function keepTyping(token: string, chatId: string) {
  await sendTyping(token, chatId);
  await wait(1200);
  await sendTyping(token, chatId);
  await wait(1200);
  await sendTyping(token, chatId);
  await wait(900);
}

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

  const update = (typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {}) as TelegramUpdate;
  const chatId = update.message?.chat?.id;
  if (!chatId || update.message?.from?.is_bot) {
    res.status(200).json({ ok: true, skipped: true });
    return;
  }

  const chat = String(chatId);
  try {
    await keepTyping(token, chat);
    const picks = demoTelegramPicks();
    if (!picks.length) {
      await sendTelegramText(token, chat, "Der Agent Swarm hat keine Founder Top Picks gefunden.");
      res.status(200).json({ ok: true, message: "No founder picks found." });
      return;
    }
    await sendTelegramTopPicks(token, chat, picks, absoluteBaseUrl(req));
    res.status(200).json({ ok: true, message: "Agent Swarm flow sent to Telegram." });
  } catch (error) {
    await sendTelegramText(token, chat, "Der Agent Swarm konnte gerade nicht abgeschlossen werden. Bitte starte die Demo gleich noch einmal.");
    res.status(200).json({ ok: false, error: error instanceof Error ? error.message : "Telegram webhook failed." });
  }
}
