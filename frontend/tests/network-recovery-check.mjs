// Exercise the same STOMP client configuration as the browser, plus a lost HTTP acknowledgement.
import net from "node:net";
import http from "node:http";
import WebSocket from "ws";
import { Client } from "@stomp/stompjs";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const phase = process.argv[2] || "after";
const base = "http://localhost:8081",
  delay = (ms) => new Promise((r) => setTimeout(r, ms));
const env = Object.fromEntries(
  (await readFile("../.env", "utf8"))
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
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
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(r.status, 200);
  const v = await r.json();
  return ["/session", "/auth/login"].includes(path)
    ? { actor: v, cookie: r.headers.get("set-cookie").split(";")[0] }
    : v;
}
const admin = await call(null, "/auth/login", {
  username: env.ADMIN_USERNAME,
  password: env.ADMIN_PASSWORD,
});
const cat = await call(admin, "/catalog"),
  quiz = await call(admin, "/admin/quizzes", {
    title: "Recovery fixture",
    description: "Test only",
    status: "PUBLISHED",
    chapterIds: [cat.chapters[0].id],
    count: 1,
    timeLimitSeconds: 0,
    questionSeconds: 120,
    shuffle: true,
  });
const room = await call(admin, "/admin/rooms", { quizId: quiz.id });
const p = await call(null, "/session", { name: "Recovery learner" }),
  other = await call(null, "/session", { name: "Recovery peer" });
await call(p, `/rooms/${room.id}/join`, {});
await call(other, `/rooms/${room.id}/join`, {});
const links = new Set();
const proxy = net.createServer((down) => {
  const up = net.connect(8081, "127.0.0.1"),
    l = { down, up, drop: false };
  links.add(l);
  down.on("data", (b) => {
    if (!l.drop) up.write(b);
  });
  up.on("data", (b) => {
    if (!l.drop) down.write(b);
  });
  down.on("close", () => {
    if (!l.drop) up.destroy();
  });
  up.on("close", () => {
    links.delete(l);
    down.destroy();
  });
  down.on("error", () => {});
  up.on("error", () => {});
});
await new Promise((r) => proxy.listen(18084, "127.0.0.1", r));
let connections = 0,
  latest = null,
  stompError = false;
const client = new Client({
  webSocketFactory: () =>
    new WebSocket("ws://localhost:18084/ws", {
      headers: { Cookie: p.cookie, Origin: "http://localhost:3000" },
    }),
  connectHeaders: { "X-CSRF-Token": p.actor.csrf },
  reconnectDelay: 2000,
  heartbeatIncoming: 10000,
  heartbeatOutgoing: 10000,
  discardWebsocketOnCommFailure: phase !== "before",
  debug: () => {},
  onConnect: () => {
    connections++;
    client.subscribe("/topic/rooms/" + room.id, () => {});
    void call(p, "/rooms/" + room.id).then((x) => (latest = x));
  },
  onStompError: () => (stompError = true),
});
let lostAckAccepted = false;
const ackProxy = http.createServer(async (req, res) => {
  try {
    const body = [];
    for await (const b of req) body.push(b);
    const result = await fetch(base + req.url, {
      method: req.method,
      headers: req.headers,
      body: Buffer.concat(body),
    });
    lostAckAccepted = result.ok;
    await result.arrayBuffer();
    res.destroy();
  } catch {
    res.destroy();
  }
});
await new Promise((r) => ackProxy.listen(18085, "127.0.0.1", r));
const wait = async (predicate, ms) => {
  const until = Date.now() + ms;
  while (!predicate()) {
    assert(Date.now() < until, "Recovery timeout");
    await delay(50);
  }
};
try {
  client.activate();
  await wait(() => connections === 1 && latest, 10000);
  const old = [...links][0];
  old.drop = true;
  const started = performance.now();
  const opened = await call(admin, `/admin/rooms/${room.id}/start`, {});
  await wait(() => connections >= 2 && latest?.status === "QUESTION", 70000);
  const recoveryMs = Math.round(performance.now() - started);
  assert.equal(latest.question.id, opened.question.id);
  assert(!("correct" in latest.question));
  assert.equal(stompError, false);
  await assert.rejects(
    fetch(`http://localhost:18085/api/rooms/${room.id}/answer`, {
      method: "POST",
      headers: {
        Cookie: p.cookie,
        "X-CSRF-Token": p.actor.csrf,
        Origin: "http://localhost:3000",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ questionId: opened.question.id, answer: 0 }),
      signal: AbortSignal.timeout(5000),
    }),
  );
  assert(lostAckAccepted);
  assert.equal((await call(p, "/rooms/" + room.id)).myAnswer, 0);
  const retry = await call(p, `/rooms/${room.id}/answer`, {
    questionId: opened.question.id,
    answer: 1,
  });
  assert.equal(retry.myAnswer, 0);
  assert.equal(retry.answered, 1);
  await call(other, `/rooms/${room.id}/answer`, {
    questionId: opened.question.id,
    answer: 2,
  });
  const done = await call(p, "/rooms/" + room.id);
  assert.equal(done.status, "REVEAL");
  assert.equal(done.myAnswer, 0);
  assert.deepEqual(done.question.options, latest.question.options);
  const result = {
    automaticReconnect: true,
    connections,
    recoveryMs,
    lostAcknowledgementRecovered: true,
    duplicateAnswerPreserved: true,
    unrevealedKeyHidden: true,
    optionOrderPreserved: true,
  };
  await writeFile(
    "../work/network-recovery-" + phase + ".json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
  await call(admin, `/admin/rooms/${room.id}/finish`, {});
} finally {
  await client.deactivate({ force: true });
  for (const l of links) {
    l.down.destroy();
    l.up.destroy();
  }
  proxy.close();
  ackProxy.close();
  await call(admin, "/auth/logout", {});
}
