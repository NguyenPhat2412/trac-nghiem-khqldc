// Local test database only. A TCP black hole keeps the server-side connection alive.
import net from "node:net";
import WebSocket from "ws";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const base = "http://localhost:8081";
const links = [];
const proxy = net.createServer((down) => {
  const up = net.connect(8081, "127.0.0.1");
  const link = { down, up, drop: false, closed: false };
  links.push(link);
  down.on("data", (b) => {
    if (!link.drop) up.write(b);
  });
  up.on("data", (b) => {
    if (!link.drop) down.write(b);
  });
  down.on("close", () => {
    if (!link.drop) up.destroy();
  });
  up.on("close", () => {
    link.closed = true;
    down.destroy();
  });
  down.on("error", () => {});
  up.on("error", () => {});
});
await new Promise((r) => proxy.listen(18082, "127.0.0.1", r));
async function call(p, path, body) {
  const r = await fetch(base + "/api" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Cookie: p?.cookie || "",
      "X-CSRF-Token": p?.actor?.csrf || "",
      Origin: "http://localhost:3000",
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.equal(r.status, 200);
  const v = await r.json();
  return path === "/session"
    ? { actor: v, cookie: r.headers.get("set-cookie").split(";")[0] }
    : v;
}
const p = await call(null, "/session", { name: "Network liveness probe" });
const sockets = [];
const heartbeat = [];
let rejected = 0;
function connect() {
  return new Promise((resolve, reject) => {
    const w = new WebSocket("ws://localhost:18082/ws", {
      headers: { Cookie: p.cookie, Origin: "http://localhost:3000" },
    });
    sockets.push(w);
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        w.terminate();
        reject(new Error("timeout"));
      }
    }, 3000);
    w.on("open", () =>
      w.send(
        `CONNECT\naccept-version:1.2\nhost:localhost\nX-CSRF-Token:${p.actor.csrf}\nheart-beat:10000,10000\n\n\0`,
      ),
    );
    w.on("message", (b) => {
      const text = b.toString();
      if (text.startsWith("CONNECTED")) {
        done = true;
        clearTimeout(timer);
        heartbeat.push(text.match(/heart-beat:([^\n]+)/)?.[1]);
        resolve(w);
      }
    });
    w.on("close", () => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        reject(new Error("closed"));
      }
    });
    w.on("error", () => {});
  });
}
try {
  for (let i = 0; i < 4; i++) {
    const w = await connect();
    links.at(-1).drop = true;
    w.terminate();
  }
  try {
    await connect();
  } catch {
    rejected++;
  }
  await new Promise((r) => setTimeout(r, 45000));
  let recovered = true;
  try {
    await connect();
  } catch {
    recovered = false;
  }
  const closedAt45 = links.slice(0, 4).filter((l) => l.closed).length;
  if (process.argv[2] === "after")
    await new Promise((r) => setTimeout(r, 30000));
  const result = {
    closedAt45,
    serverHeartbeat: heartbeat,
    blackholedConnections: 4,
    rejectedWhileSlotsOccupied: rejected,
    serverClosedStaleLinks: links.slice(0, 4).filter((l) => l.closed).length,
    recoveredAfter45Seconds: recovered,
  };
  const phase = process.argv[2] || "before";
  await writeFile(
    "../work/network-probe-" + phase + ".json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
  if (phase === "after")
    assert(recovered && result.serverClosedStaleLinks === 4);
} finally {
  for (const w of sockets) w.terminate();
  for (const l of links) {
    l.down.destroy();
    l.up.destroy();
  }
  proxy.close();
}
