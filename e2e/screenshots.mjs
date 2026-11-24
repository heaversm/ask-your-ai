// Screenshots for the About page, in a separate headless Firefox.
// Runs Llama 3.2 3B on the Mail System email and Qwen3 14B on the introduction email,
// then captures the email page and the browser's log.
// Usage: node e2e/screenshots.mjs <output folder>
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { PORT, serve } from "../site/server.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = process.argv[2] ?? join(root, "artifacts");
mkdirSync(out, { recursive: true });
const EXT = join(root, "extension");
const id = JSON.parse(readFileSync(join(EXT, "manifest.json"), "utf8")).browser_specific_settings.gecko.id;
const hex = createHash("sha256").update(id).digest("hex");
const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = await serve(PORT);
const b = await puppeteer.launch({ browser: "firefox", executablePath: "/Applications/Firefox.app/Contents/MacOS/firefox", headless: true, protocolTimeout: 600_000,
  userDataDir: mkdtempSync(join(tmpdir(), "ayai-shot-")), args: ["-remote-allow-system-access"],
  env: { ...process.env, MOZ_DISABLE_UPDATE_PROCESSING: "1", MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: "1" },
  extraPrefsFirefox: { "extensions.webextensions.uuids": JSON.stringify({ [id]: uuid }) } });
try {
  await b.installExtension(EXT);
  const log = await b.newPage(); await log.setViewport({ width: 620, height: 1000 });
  log.goto(`moz-extension://${uuid}/log.html`, { timeout: 0 }).catch(() => {});
  for (let i = 0; i < 80 && !(await log.evaluate(() => typeof browser !== "undefined" && !!browser.storage).catch(() => false)); i++) await sleep(250);
  const p = await b.newPage(); await p.setViewport({ width: 1200, height: 720 });
  for (const [thread, model, shot] of [["sync", "llama3.2:3b", "mail-sync-llama.png"], ["intro", "qwen3:14b", "mail-intro-qwen.png"]]) {
    await log.evaluate((model) => browser.storage.local.set({ settings: { ai: "local", model } }), model);
    await p.goto(`http://localhost:${PORT}/t/${thread}`);
    await p.waitForFunction(() => !document.getElementById("ask").disabled);
    await p.click("#show"); await p.click("#ask");
    await p.waitForFunction(() => document.body.dataset.result && document.body.dataset.result !== "waiting", { timeout: 300_000 });
    await p.screenshot({ path: join(out, shot) });
    console.log(thread, model, await p.evaluate(() => document.body.dataset.result));
  }
  await log.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
  await sleep(500);
  await log.screenshot({ path: join(out, "log.png"), fullPage: true });
} finally { await b.close(); server.close(); }
