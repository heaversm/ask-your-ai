// A minimal JSON-RPC 2.0 peer over newline-delimited JSON, which is how ACP
// travels over a process's stdin and stdout. Used by both the client (host.mjs)
// and the scripted agent (fooled-agent.mjs).

export function peer(input, output, { onRequest = async () => { throw new Error("no handler"); }, onNotification = () => {} } = {}) {
  let nextId = 1;
  const pending = new Map();
  let buffer = "";
  const send = (msg) => output.write(JSON.stringify({ jsonrpc: "2.0", ...msg }) + "\n");

  input.setEncoding("utf8");
  input.on("data", (chunk) => {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      handle(msg);
    }
  });

  async function handle(msg) {
    if (msg.method && msg.id !== undefined) {
      try {
        send({ id: msg.id, result: await onRequest(msg.method, msg.params ?? {}) });
      } catch (err) {
        send({ id: msg.id, error: { code: -32603, message: String(err?.message ?? err) } });
      }
    } else if (msg.method) {
      onNotification(msg.method, msg.params ?? {});
    } else if (pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(Object.assign(new Error(msg.error.message), { data: msg.error.data }));
      else resolve(msg.result);
    }
  }

  return {
    request(method, params) {
      const id = nextId++;
      send({ id, method, params });
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    notify(method, params) { send({ method, params }); },
  };
}
