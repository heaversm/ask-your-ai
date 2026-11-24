// Opens a separate, clean Firefox (not your main one) with the extension
// installed: Test Mail in one tab, the browser's log in another.
//   node e2e/demo.mjs            Claude Code (your Claude Code login; each ask uses it)
//   node e2e/demo.mjs --fooled   the scripted agent that falls for everything, no cost
// Close the Firefox window, or press Ctrl-C here, to stop.
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { PORT, serve } from "../site/server.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const EXT = join(root, "extension");
if (!existsSync(join(EXT, "paths.json"))) { console.error("Run `node lib/install-host.mjs` first."); process.exit(1); }
const ai = process.argv.includes("--fooled") ? "fooled" : "claude";
const extId = JSON.parse(readFileSync(join(EXT, "manifest.json"), "utf8")).browser_specific_settings.gecko.id;
const hex = createHash("sha256").update(extId).digest("hex");
const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = await serve(PORT);
const browser = await puppeteer.launch({
  browser: "firefox", executablePath: process.env.FIREFOX ?? "/Applications/Firefox.app/Contents/MacOS/firefox",
  headless: process.argv.includes("--headless"), defaultViewport: null,
  userDataDir: mkdtempSync(join(tmpdir(), "ask-your-ai-demo-")),
  args: ["-remote-allow-system-access"],
  env: { ...process.env, MOZ_DISABLE_UPDATE_PROCESSING: "1", MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: "1" },
  extraPrefsFirefox: { "extensions.webextensions.uuids": JSON.stringify({ [extId]: uuid }) },
});
await browser.installExtension(EXT);
const log = (await browser.pages())[0];
log.goto(`moz-extension://${uuid}/log.html`, { timeout: 0 }).catch(() => {});
for (let i = 0; i < 80 && !(await log.evaluate(() => typeof browser !== "undefined" && !!browser.storage).catch(() => false)); i++) await sleep(250);
await log.evaluate((ai) => browser.storage.local.set({ settings: { ai, model: "claude-sonnet-5-5" }, log: [] }), ai);
const mail = await browser.newPage();
await mail.goto(`http://localhost:${PORT}/t/dinner`);
console.log(`Demo open (${ai === "claude" ? "Claude Code" : "scripted fooled agent"}). Tabs: Test Mail, and the log. Switch AI on the log tab. Ctrl-C to stop.`);
if (process.argv.includes("--headless")) { await browser.close(); server.close(); process.exit(0); }
browser.on("disconnected", () => { server.close(); process.exit(0); });
process.on("SIGINT", async () => { await browser.close().catch(() => {}); server.close(); process.exit(0); });
