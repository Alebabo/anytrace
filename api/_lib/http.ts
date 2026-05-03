import type { IncomingHttpHeaders, IncomingMessage } from "node:http";

export type ApiRequest = IncomingMessage & {
  body?: Buffer | Record<string, unknown> | string | null;
  headers: IncomingHttpHeaders;
  method?: string;
};

export type ApiResponse = {
  status: (code: number) => ApiResponse;
  setHeader: (name: string, value: string) => void;
  send: (body: string) => void;
};

export function sendJson(res: ApiResponse, status: number, body: unknown) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.send(JSON.stringify(body));
}

export async function readJsonBody(req: ApiRequest) {
  if (typeof req.body === "object" && req.body !== null) {
    return req.body;
  }

  const raw = await readRawBody(req);
  if (!raw) return {};
  try {
    return JSON.parse(raw.toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new Error("Request body is not valid JSON.");
  }
}

export async function readRawBody(req: ApiRequest) {
  if (Buffer.isBuffer(req.body)) {
    return req.body;
  }

  if (typeof req.body === "string") {
    return Buffer.from(req.body);
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export function getBearerToken(req: ApiRequest) {
  const header = req.headers.authorization;
  if (!header || typeof header !== "string" || !header.startsWith("Bearer ")) {
    return null;
  }
  return header.slice("Bearer ".length).trim();
}
