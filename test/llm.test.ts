// Tes adapter AI terhadap server palsu yang niru API OpenAI & Anthropic. Jalankan: npm test
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "japri-test-"));
import { after, before, describe, test } from "node:test";
import assert from "node:assert";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { LLMConfig } from "../src/config.js";

const { saveConfig, newConfig, loadConfig } = await import("../src/config.js");
const store = await import("../src/db.js");
const { createLLM, testToolCalling } = await import("../src/llm/index.js");
const { listModels } = await import("../src/llm/openai-compatible.js");
const { buildTools } = await import("../src/agent/tools.js");

// Request pertama: model "memanggil" plan.tool dengan plan.args. Request kedua: balas pakai hasil tool.
let plan: { tool: string; args: unknown } = { tool: "get_secret_word", args: {} };

const server = http.createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  const j = body ? JSON.parse(body) : {};
  res.setHeader("content-type", "application/json");

  if (req.url?.endsWith("/models")) {
    return res.end(JSON.stringify({ object: "list", data: [{ id: "mock-a", object: "model" }, { id: "mock-b", object: "model" }] }));
  }
  if (req.url?.endsWith("/chat/completions")) {
    const toolMsg = [...j.messages].reverse().find((m: { role: string }) => m.role === "tool");
    const message = toolMsg
      ? { role: "assistant", content: `hasil: ${toolMsg.content}` }
      : { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: plan.tool, arguments: JSON.stringify(plan.args) } }] };
    return res.end(JSON.stringify({ id: "x", object: "chat.completion", created: 0, model: j.model, choices: [{ index: 0, finish_reason: "stop", message }] }));
  }
  if (req.url?.endsWith("/v1/messages")) {
    const last = j.messages[j.messages.length - 1];
    const result = Array.isArray(last.content) && last.content.find((b: { type: string }) => b.type === "tool_result");
    const base = { id: "m", type: "message", role: "assistant", model: j.model, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } };
    if (!result) {
      return res.end(JSON.stringify({ ...base, stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: plan.tool, input: plan.args }] }));
    }
    const text = typeof result.content === "string" ? result.content : result.content.map((b: { text: string }) => b.text).join("");
    return res.end(JSON.stringify({ ...base, stop_reason: "end_turn", content: [{ type: "text", text: `hasil: ${text}` }] }));
  }
  res.statusCode = 404;
  res.end("{}");
});

let providers: LLMConfig[] = [];
before(async () => {
  await new Promise<void>((r) => server.listen(0, r));
  const { port } = server.address() as AddressInfo;
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${port}`;
  providers = [
    { provider: "openai", model: "mock-a", apiKey: "k", baseUrl: `http://127.0.0.1:${port}/v1` },
    { provider: "anthropic", model: "claude-opus-5-5", apiKey: "k" },
  ];
  saveConfig(newConfig(providers[0]));
  store.upsertGroup("g1@g.us", "Tim Kantor");
  store.saveMessage({ id: "m1", chat_jid: "g1@g.us", sender_name: "Budi", from_owner: 0, text: "meeting dipindah jam 3", ts: Math.floor(Date.now() / 1000) - 60 });
});
after(() => server.close());

const run = (llm: LLMConfig) => createLLM(llm).run({ system: "s", history: [{ role: "user", text: "x" }], tools: buildTools() });

for (const name of ["openai", "anthropic"]) {
  describe(name, () => {
    const llm = () => providers.find((p) => p.provider === name)!;

    test("testToolCalling lolos", async () => {
      plan = { tool: "get_secret_word", args: {} };
      const res = await testToolCalling(llm());
      assert.ok(res.ok, res.detail);
    });

    test("read_group_messages ngasih transkrip", async () => {
      plan = { tool: "read_group_messages", args: { group: "kantor", hours_back: 2 } };
      assert.match(await run(llm()), /Budi: meeting dipindah jam 3/);
    });

    test("set_reminder nyimpen reminder", async () => {
      plan = { tool: "set_reminder", args: { text: "kirim laporan", due_at: new Date(Date.now() + 3600e3).toISOString() } };
      assert.match(await run(llm()), /Reminder #\d+ dibuat/);
    });

    test("argumen tool salah gak bikin crash", async () => {
      plan = { tool: "set_reminder", args: { text: 123 } };
      assert.match(await run(llm()), /hasil:/);
    });

    test("update_settings nyimpen ke config", async () => {
      plan = { tool: "update_settings", args: { nicknames: ["Andi", " Ndi "], timezone: "Asia/Makassar" } };
      await run(llm());
      assert.deepEqual(loadConfig().nicknames, ["andi", "ndi"]);
      assert.equal(loadConfig().timezone, "Asia/Makassar");
    });
  });
}

test("listModels baca endpoint /models", async () => {
  assert.deepEqual(await listModels(providers[0]), ["mock-a", "mock-b"]);
});
