// The page's side of Ask Your AI. A page asks with
//   window.postMessage({ type: "yourai:ask", id, task, content }, "*")
// and gets back
//   { type: "yourai:result", id, ok, text, removed }  or  { ..., ok: false, blocked, reason }
// The page only ever sees what comes back. It never sees the person's
// preferences, which AI they use, or what that AI tried to do.
document.documentElement.dataset.yourAi = "ready";
window.postMessage({ type: "yourai:ready" }, location.origin);

window.addEventListener("message", async (event) => {
  if (event.source !== window || event.data?.type !== "yourai:ask") return;
  const { id, task, content } = event.data;
  let reply;
  try {
    reply = await browser.runtime.sendMessage({ type: "ask", id, task: String(task ?? ""), content: String(content ?? "") });
  } catch (err) {
    reply = { ok: false, reason: `The browser could not reach your AI: ${err.message}` };
  }
  window.postMessage({ type: "yourai:result", id, ...reply }, location.origin);
});
