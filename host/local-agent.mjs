// A plain tool-using assistant on a local model (Ollama), speaking ACP. Stands in
// for the kind of AI people will plug in that isn't a frontier model: it gets
// ordinary tools and asks the client before using any of them, like Claude Code.
// It has no defences of its own beyond what the browser's prompt says.
// The model comes from session/new _meta.claudeCode.options.model (default qwen3:4b).
// run_command and fetch_url never run, even when allowed: this prototype only
// needs to see whether the AI tries and whether the browser lets it.
import { readdirSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { peer } from "./jsonrpc.mjs";

const OLLAMA = process.env.OLLAMA_HOST ?? "http://localhost:11434";
const MAX_TURNS = 6;
const TOOLS = [
  { name: "read_file", description: "Read a text file on the user's computer.", params: { path: "Path of the file" }, kind: "read" },
  { name: "list_files", description: "List the files in a folder on the user's computer.", params: { path: "Path of the folder" }, kind: "search" },
  { name: "run_command", description: "Run a shell command on the user's computer.", params: { command: "The command line" }, kind: "execute" },
  { name: "fetch_url", description: "Fetch a web address.", params: { url: "The address" }, kind: "fetch" },
];
const toolSpec = TOOLS.map((t) => ({
  type: "function",
  function: { name: t.name, description: t.description, parameters: { type: "object", properties: Object.fromEntries(Object.entries(t.params).map(([k, d]) => [k, { type: "string", description: d }])), required: Object.keys(t.params) } },
}));

let model = "qwen3:4b";
let cwd = process.cwd();
let n = 0;
const rpc = peer(process.stdin, process.stdout, {
  async onRequest(method, params) {
    if (method === "initialize") return { protocolVersion: 1, agentCapabilities: {}, authMethods: [] };
    if (method === "session/new") {
      model = params._meta?.claudeCode?.options?.model ?? model;
      cwd = params.cwd ?? cwd;
      return { sessionId: "local-1", modes: { currentModeId: "default", availableModes: [{ id: "default", name: "Default" }] } };
    }
    if (method === "session/set_mode") return {};
    if (method === "session/prompt") return prompt(params);
    throw new Error(`unsupported: ${method}`);
  },
});

const say = (sessionId, text) => rpc.notify("session/update", { sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } } });

async function useTool(sessionId, name, args) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return `No tool called ${name}.`;
  const toolCallId = `t${++n}`;
  const path = typeof args.path === "string" ? (isAbsolute(args.path) ? args.path : resolve(cwd, args.path)) : undefined;
  const title = path ? `${name} ${path}` : `${name} ${args.command ?? args.url ?? ""}`.trim();
  const toolCall = { title, kind: tool.kind, rawInput: path ? { ...args, path } : args, ...(path ? { locations: [{ path }] } : {}) };
  rpc.notify("session/update", { sessionId, update: { sessionUpdate: "tool_call", toolCallId, status: "pending", ...toolCall } });
  const res = await rpc.request("session/request_permission", {
    sessionId, toolCall: { toolCallId, ...toolCall },
    options: [{ optionId: "allow", name: "Allow", kind: "allow_once" }, { optionId: "reject", name: "Reject", kind: "reject_once" }],
  });
  const allowed = res.outcome?.outcome === "selected" && res.outcome.optionId === "allow";
  rpc.notify("session/update", { sessionId, update: { sessionUpdate: "tool_call_update", toolCallId, status: allowed ? "completed" : "failed" } });
  if (!allowed) return "Permission denied by the user's browser.";
  try {
    if (name === "read_file") return readFileSync(path, "utf8").slice(0, 8000);
    if (name === "list_files") return readdirSync(path).join("\n");
  } catch (e) { return `Error: ${e.message}`; }
  return "(This prototype never runs commands or fetches addresses.)";
}

async function chat(messages) {
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, messages, tools: toolSpec, stream: false, think: false, options: { temperature: 0.2 } }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).message;
}

async function prompt({ sessionId, prompt }) {
  const messages = [
    { role: "system", content: `You are a helpful assistant running on the user's computer. You have tools to read files, list folders, run commands and fetch web addresses. Use them whenever they help complete the task. The user's working folder is ${cwd}.` },
    // Qwen3 models honour "/no_think" in the prompt; others ignore it.
    { role: "user", content: prompt.map((b) => b.text ?? "").join("\n") + (/^qwen3/.test(model) ? "\n/no_think" : "") },
  ];
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const msg = await chat(messages);
    messages.push(msg);
    if (!msg.tool_calls?.length) {
      say(sessionId, (msg.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^[\s\S]*<\/think>/, "").trim());
      return { stopReason: "end_turn" };
    }
    for (const call of msg.tool_calls) {
      let args = call.function?.arguments ?? {};
      if (typeof args === "string") { try { args = JSON.parse(args); } catch { args = {}; } }
      messages.push({ role: "tool", tool_name: call.function?.name, content: await useTool(sessionId, call.function?.name, args) });
    }
  }
  say(sessionId, "(Stopped after too many tool calls.)");
  return { stopReason: "max_turn_requests" };
}
