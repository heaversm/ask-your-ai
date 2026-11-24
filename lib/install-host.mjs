// Registers the native messaging host with Firefox for this user, and tells the
// extension where the sample folder is.
//   node lib/install-host.mjs            install
//   node lib/install-host.mjs --remove   uninstall
// Writes:
//   ~/Library/Application Support/Mozilla/NativeMessagingHosts/ask_your_ai.json (macOS)
//   ~/.mozilla/native-messaging-hosts/ask_your_ai.json (Linux)
//   <same folder>/ask_your_ai.sh (starts host.mjs with this machine's node). It lives
//     there, not in this repo, because macOS stopped Firefox from starting a script
//     kept in ~/Documents (seen Nov 20 2026). Its errors go to ask_your_ai.log beside it.
//   extension/paths.json (the sample folder's full path)
// Only the Ask Your AI extension (its id is in the manifest) may start the host.
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const NAME = "ask_your_ai";
const dir = platform() === "darwin"
  ? join(homedir(), "Library/Application Support/Mozilla/NativeMessagingHosts")
  : join(homedir(), ".mozilla/native-messaging-hosts");
const manifestPath = join(dir, `${NAME}.json`);
const runner = join(dir, `${NAME}.sh`);
const errors = join(dir, `${NAME}.log`);
const paths = join(root, "extension/paths.json");

if (process.argv.includes("--remove")) {
  for (const f of [manifestPath, runner, errors, paths]) if (existsSync(f)) { rmSync(f); console.log(`removed ${f}`); }
  process.exit(0);
}
const extId = JSON.parse(readFileSync(join(root, "extension/manifest.json"), "utf8")).browser_specific_settings.gecko.id;
mkdirSync(dir, { recursive: true });
writeFileSync(runner, `#!/bin/sh\nexec "${process.execPath}" "${join(root, "host/host.mjs")}" "$@" 2>> "${errors}"\n`);
chmodSync(runner, 0o755);
writeFileSync(manifestPath, JSON.stringify({ name: NAME, description: "Ask Your AI prototype: connects the extension to your AI over ACP", path: runner, type: "stdio", allowed_extensions: [extId] }, null, 2) + "\n");
writeFileSync(paths, JSON.stringify({ workspace: join(root, "workspace") }, null, 2) + "\n");
console.log(`installed ${manifestPath}\n  runs ${runner}\n  only for ${extId}\nwrote ${paths}`);
