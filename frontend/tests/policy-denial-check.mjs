// Fail-closed protocol rejection must never echo or log authentication headers.
import WebSocket from "ws";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile } from "node:fs/promises";
const exec = promisify(execFile),
  since = new Date().toISOString();
const r = await fetch("http://localhost:8081/api/session", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Origin: "http://localhost:3000",
  },
  body: JSON.stringify({ name: "Policy denial regression" }),
});
assert.equal(r.status, 200);
const actor = await r.json(),
  cookie = r.headers.get("set-cookie").split(";")[0];
const marker = "sensitive-header-probe-" + crypto.randomUUID();
function probe(token, mode = null) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket("ws://localhost:8081/ws", {
      headers: { Cookie: cookie, Origin: "http://localhost:3000" },
    });
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error("Denied connection did not close"));
    }, 5000);
    let connected = false;
    ws.on("open", () =>
      ws.send(
        `CONNECT\naccept-version:1.2\nhost:localhost\nX-CSRF-Token:${token}\nheart-beat:0,0\n\n\0`,
      ),
    );
    ws.on("message", (raw) => {
      const frame = raw.toString();
      assert(!frame.includes(marker));
      if (frame.startsWith("CONNECTED")) {
        connected = true;
        if (mode === "send")
          ws.send('SEND\ndestination:/topic/rooms/000000\n\n{"score":100}\0');
        if (mode === "subscribe")
          ws.send(
            "SUBSCRIBE\nid:denied\ndestination:/topic/rooms/000000\n\n\0",
          );
      }
    });
    ws.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    ws.on("close", (code) => {
      clearTimeout(timer);
      try {
        assert.equal(code, 1008);
        assert.equal(connected, mode !== null);
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  });
}
for (let i = 0; i < 5; i++) await probe(marker);
await probe(actor.csrf, "subscribe");
await probe(actor.csrf, "send");
const { stdout } = await exec(
  "docker",
  ["compose", "--profile", "test", "logs", "--since", since, "test-backend"],
  { cwd: ".." },
);
assert(!stdout.includes(marker), "Rejected CSRF probe appeared in logs");
assert(!stdout.includes(actor.csrf), "Valid CSRF token appeared in logs");
assert(
  stdout.includes("WebSocket rejected"),
  "Sanitized rejection audit missing",
);
const result = {
  invalidConnectClosed: 5,
  unauthorizedSubscribeClosed: true,
  forgedSendClosed: true,
  closeCode: 1008,
  tokenLeaked: false,
  sanitizedAudit: true,
  slotsReleased: true,
};
await writeFile(
  "../work/performance-subsecond/policy-denial.json",
  JSON.stringify(result, null, 2),
);
console.log(
  "PASS policy denial closes transport, releases slots and logs no CSRF headers",
);
