const DEFAULTS = { ai: "claude", model: "claude-sonnet-5-5" };
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

async function render() {
  const { log = [], settings = {} } = await browser.storage.local.get(["log", "settings"]);
  const s = { ...DEFAULTS, ...settings };
  $("ai").value = s.ai; $("model").value = s.model;
  $("log").innerHTML = log.length ? log.map((e) => `
    <div class="entry" data-outcome="${esc(e.outcome)}">
      <div class="head"><span>${esc(e.site)}: ${esc(e.task)}</span><span class="outcome ${esc(e.outcome)}">${esc(e.outcome)}</span></div>
      <div>${esc(e.page ?? e.origin)}<br>${new Date(e.time).toLocaleString()} · ${esc({ claude: `Claude Code, ${e.model}`, local: `local model, ${e.model}`, fooled: "scripted fooled agent" }[e.ai] ?? e.ai)}</div>
      <ol>${e.steps.map((st) => `<li class="${esc(st.what.split(" ")[0])}"><span class="what">${esc(st.what)}</span> ${esc(st.detail)}</li>`).join("")}</ol>
      ${e.answer !== undefined ? `<details><summary>What your AI wrote${e.returned !== undefined && e.returned !== e.answer ? " / what the page got" : ""}</summary><pre>${esc(e.answer)}</pre>${e.returned !== undefined && e.returned !== e.answer ? `<pre>${esc(e.returned)}</pre>` : ""}</details>` : ""}
    </div>`).join("") : `<p class="empty">Nothing yet. When a page asks your AI for something, every step shows up here.</p>`;
}
$("ai").addEventListener("change", async () => { const { settings = {} } = await browser.storage.local.get("settings"); await browser.storage.local.set({ settings: { ...DEFAULTS, ...settings, ai: $("ai").value } }); });
$("model").addEventListener("change", async () => { const { settings = {} } = await browser.storage.local.get("settings"); await browser.storage.local.set({ settings: { ...DEFAULTS, ...settings, model: $("model").value.trim() } }); });
$("clear").addEventListener("click", () => browser.storage.local.set({ log: [] }));
browser.storage.onChanged.addListener(render);
render();
