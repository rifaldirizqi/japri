// Server HTTP kecil di 127.0.0.1 buat jendela setup & Pengaturan (ditampilin Japri.exe di jendela WebView2).
// Halaman & semua API wajib bawa token acak dari URL, biar halaman web lain gak bisa nembak API ini.
import crypto from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { configExists, loadConfig, type LLMConfig } from "../config.js";
import { openInBrowser } from "../desktop.js";
import { ANTHROPIC_MODELS } from "../llm/anthropic.js";
import { PROVIDERS, testToolCalling } from "../llm/index.js";
import { listModels } from "../llm/openai-compatible.js";
import { asksApiKey, needsBaseUrl } from "./wizard.js";

export type Body = Record<string, unknown>;
export type Reply = { status?: number; body: unknown; after?: () => void };
/** Return undefined kalau route-nya gak dikenal (jadi 404). */
export type Routes = (route: string, body: Body) => Promise<Reply | undefined> | Reply | undefined;

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
export const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function readJson(req: http.IncomingMessage): Promise<Body> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      raw += chunk;
      if (raw.length > 64 * 1024) req.destroy(new Error("Request kegedean"));
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

/** Daftar provider buat form pengaturan AI. */
export const providerList = () =>
  PROVIDERS.map((p) => ({
    id: p.id,
    label: p.label,
    keyHelp: p.keyHelp,
    baseUrl: p.baseUrl,
    needsKey: !!p.needsKey,
    asksApiKey: asksApiKey(p.id),
    needsBaseUrl: needsBaseUrl(p.id),
  }));

/** Pengaturan AI dari form. API key kosong = pakai key lama, kalau provider-nya sama. */
export function toLLM(body: Body): LLMConfig {
  const preset = PROVIDERS.find((p) => p.id === str(body.provider));
  if (!preset) throw new Error("Provider gak dikenal");
  const provider = preset.id;
  const old = configExists() ? loadConfig().llm : undefined;
  const apiKey = asksApiKey(provider) ? str(body.apiKey) || (old?.provider === provider ? old.apiKey : undefined) : undefined;
  return {
    provider,
    model: str(body.model),
    apiKey,
    baseUrl: needsBaseUrl(provider) ? str(body.baseUrl) || preset.baseUrl : preset.baseUrl,
  };
}

/** Route bareng: daftar model, tes model, dan buka link https di browser. */
export async function commonRoutes(route: string, body: Body): Promise<Reply | undefined> {
  switch (route) {
    case "POST /api/models": {
      const llm = toLLM(body);
      if (llm.provider === "anthropic") return { body: { models: ANTHROPIC_MODELS.map((m) => m.id) } };
      try {
        return { body: { models: await listModels(llm) } };
      } catch (e) {
        return { body: { models: [], error: errorText(e) } };
      }
    }
    case "POST /api/test": {
      const llm = toLLM(body);
      if (!llm.model) return { status: 400, body: { error: "Model belum dipilih" } };
      return { body: await testToolCalling(llm) };
    }
    case "POST /api/open": {
      const link = str(body.url);
      if (!/^https:\/\/[^\s"]+$/.test(link)) return { status: 400, body: { error: "Link gak valid" } };
      openInBrowser(link);
      return { body: { ok: true } };
    }
  }
  return undefined;
}

export async function startLocalServer(page: string, routes: Routes) {
  const token = crypto.randomBytes(16).toString("hex");
  const server = http.createServer(async (req, res) => {
    const send = (code: number, body: unknown, type = "application/json; charset=utf-8") => {
      res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
      res.end(typeof body === "string" ? body : JSON.stringify(body));
    };
    const url = new URL(req.url ?? "/", "http://127.0.0.1");

    if (req.method === "GET" && url.pathname === "/") {
      if (url.searchParams.get("t") !== token) return send(403, "Forbidden", "text/plain");
      return send(200, page, "text/html; charset=utf-8");
    }
    if (req.headers["x-japri-token"] !== token) return send(403, { error: "Forbidden" });

    try {
      const body = req.method === "POST" ? await readJson(req) : {};
      const route = `${req.method} ${url.pathname}`;
      const reply = (await routes(route, body)) ?? (await commonRoutes(route, body));
      if (!reply) return send(404, { error: "Not found" });
      send(reply.status ?? 200, reply.body);
      if (reply.after) setTimeout(reply.after, 100);
    } catch (e) {
      send(400, { error: errorText(e) });
    }
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}/?t=${token}`, close: () => server.close() };
}
