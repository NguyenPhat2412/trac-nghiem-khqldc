// 100 real HTTP/STOMP clients, fault-injected TCP, disposable localhost:8081 only.
// Run from frontend. No browser cookies or credentials are written to the result.
import net from "node:net";
import { monitorEventLoopDelay, PerformanceObserver } from "node:perf_hooks";
import WebSocket from "ws";
import { Client } from "@stomp/stompjs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
const exec = promisify(execFile),
  base = "http://localhost:8081",
  count = 100;
const loopDelay = monitorEventLoopDelay({ resolution: 10 });
loopDelay.enable();
const gcEvents = [];
const gcObserver = new PerformanceObserver((list) => {
  for (const entry of list.getEntries())
    if (entry.duration >= 25)
      gcEvents.push({
        at: new Date().toISOString(),
        durationMs: Math.round(entry.duration),
      });
});
gcObserver.observe({ entryTypes: ["gc"] });
const noFaults = process.env.SOAK_NO_FAULTS === "1";
const expireAll = process.env.SOAK_EXPIRE_ALL === "1";
const questionSeconds = expireAll ? 5 : 15;
const sloMs = Number(process.env.SOAK_SLO_MS || 0);
const forceCheckpoints = process.env.SOAK_CHECKPOINTS === "1";
const extraReadBursts = Number(process.env.SOAK_EXTRA_READS || 0);
assert(
  Number.isInteger(extraReadBursts) &&
    extraReadBursts >= 0 &&
    extraReadBursts <= 3,
);
const rounds = Number(process.env.SOAK_ROUNDS || 100),
  roundMs = Number(process.env.SOAK_ROUND_MS || 18000);
assert(rounds >= 1 && rounds <= 100 && roundMs >= (noFaults ? 1000 : 4000));
const run =
  process.env.SOAK_RUN || new Date().toISOString().replace(/[:.]/g, "-");
const dir = "../work/soak-" + run;
await mkdir(dir, { recursive: true });
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const env = Object.fromEntries(
  (await readFile("../.env", "utf8"))
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const metrics = {
  run,
  startedAt: new Date().toISOString(),
  players: count,
  noFaults,
  expireAll,
  questionSeconds,
  sloMs,
  forceCheckpoints,
  extraReadBursts,
  checkpoints: [],
  plannedRounds: rounds,
  roundMs,
  completedRounds: 0,
  httpRequests: 0,
  expectedRejections: 0,
  unexpectedErrors: [],
  connections: 0,
  reconnections: 0,
  forcedDisconnects: 0,
  blackholes: 0,
  staleLinksClosed: 0,
  answerAccepted: 0,
  intentionalBlanks: 0,
  duplicateChecks: 0,
  lateChecks: 0,
  privacyChecks: 0,
  stateChecks: 0,
  rounds: [],
  resources: [],
  recoveryMs: [],
  apiMs: [],
  answerMs: [],
  acceptedAnswerMs: [],
  finalReadMs: [],
  liveReadMs: [],
  slowReads: [],
  stompErrors: 0,
  setupRateLimitWaits: 0,
};
let checkpointWrites = Promise.resolve();
let terminalStatus = null;
let stopping = false,
  restarting = false,
  roomId,
  students = [],
  fatal = null;
function fail(e) {
  if (!fatal) {
    fatal = e;
    metrics.unexpectedErrors.push(String(e.message || e));
    console.error("FAIL", e.message);
  }
}
async function call(
  p,
  path,
  body,
  expected = [200],
  method = body === undefined ? "GET" : "POST",
) {
  const start = performance.now();
  const response = await fetch(base + "/api" + path, {
    method,
    signal: AbortSignal.timeout(20000),
    headers: {
      Cookie: p?.cookie || "",
      "X-CSRF-Token": p?.actor?.csrf || "",
      Origin: "http://localhost:3000",
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  metrics.httpRequests++;
  metrics.apiMs.push(performance.now() - start);
  if (
    method === "GET" &&
    /^\/rooms\/\d{6}$/.test(path) &&
    response.status === 200
  )
    metrics.liveReadMs.push(performance.now() - start);
  if (
    method === "GET" &&
    /^\/rooms\/\d{6}$/.test(path) &&
    performance.now() - start >= 500
  )
    metrics.slowReads.push({
      at: new Date().toISOString(),
      elapsedMs: Math.round(performance.now() - start),
      status: response.status,
    });
  assert(
    expected.includes(response.status),
    `${path}: HTTP ${response.status} ${data.message || ""}`,
  );
  if (response.status !== 200) metrics.expectedRejections++;
  return {
    data,
    status: response.status,
    cookie: response.headers.get("set-cookie")?.split(";")[0],
    headers: response.headers,
  };
}
async function session(body, path = "/session") {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await call(
      null,
      path,
      body,
      path === "/session" ? [200, 429] : [200],
    );
    if (r.status === 200) return { actor: r.data, cookie: r.cookie };
    // Consecutive runs share the same loopback IP. Respect the production guest budget.
    metrics.setupRateLimitWaits++;
    console.log("Waiting for guest-session setup budget (61 seconds)");
    await delay(61000);
  }
  throw new Error("Guest-session setup budget unavailable");
}
const links = new Set();
const proxy = net.createServer((down) => {
  const up = net.connect(8081, "127.0.0.1");
  const link = { down, up, drop: false, id: null, dropAt: 0 };
  links.add(link);
  down.on("data", (b) => {
    if (link.id === null) {
      const m = b.toString().match(/GET \/ws\?student=(\d+)/);
      if (m) link.id = Number(m[1]);
    }
    if (!link.drop) up.write(b);
  });
  up.on("data", (b) => {
    if (!link.drop) down.write(b);
  });
  down.on("close", () => {
    if (!link.drop) up.destroy();
  });
  up.on("close", () => {
    if (link.drop) metrics.staleLinksClosed++;
    links.delete(link);
    down.destroy();
  });
  down.on("error", () => {});
  up.on("error", () => {});
});
await new Promise((r) => proxy.listen(18083, "127.0.0.1", r));
function checkView(v) {
  assert.equal(v.id, roomId);
  assert.equal(v.members.length, 100);
  assert.equal(v.host, false);
  assert(!("bannedIds" in v) && !("optionSeed" in v) && !("integrity" in v));
  if (v.status === "QUESTION") {
    assert(!("correct" in v.question) && !("explanation" in v.question));
    assert.equal(v.ranking.length, 0);
    metrics.privacyChecks++;
  }
}
class Student {
  constructor(index, p) {
    Object.assign(this, p);
    this.index = index;
    this.online = true;
    this.connected = false;
    this.view = null;
    this.pending = false;
    this.loading = false;
    this.closed = false;
    this.timer = null;
    this.connections = 0;
    this.expectedCorrect = 0;
    this.lastDuration = 0;
    this.answers = new Map();
    this.options = new Map();
    this.connectionWaiters = [];
  }
  apply(v) {
    checkView(v);
    if (!this.view || v.version >= this.view.version) this.view = v;
  }
  async refresh() {
    if (this.closed || !this.online || restarting) return;
    if (this.loading) {
      this.pending = true;
      return;
    }
    this.loading = true;
    try {
      this.apply((await call(this, "/rooms/" + roomId)).data);
    } catch (e) {
      if (!restarting && !stopping) fail(e);
    } finally {
      this.loading = false;
      if (this.pending) {
        this.pending = false;
        void this.refresh();
      }
    }
  }
  schedule() {
    if (this.timer || !this.online || this.closed) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.refresh();
    }, 120);
  }
  connect() {
    this.client = new Client({
      webSocketFactory: () =>
        new WebSocket("ws://localhost:18083/ws?student=" + this.index, {
          headers: { Cookie: this.cookie, Origin: "http://localhost:3000" },
        }),
      connectHeaders: { "X-CSRF-Token": this.actor.csrf },
      reconnectDelay: 2000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      connectionTimeout: 10000,
      discardWebsocketOnCommFailure: true,
      onConnect: () => {
        this.connected = true;
        this.connections++;
        metrics.connections++;
        if (this.connections > 1) metrics.reconnections++;
        this.client.subscribe("/topic/rooms/" + roomId, (msg) => {
          const event = JSON.parse(msg.body);
          assert.deepEqual(Object.keys(event).sort(), [
            "roomId",
            "serverTime",
            "version",
          ]);
          this.schedule();
        });
        void this.refresh();
      },
      onWebSocketClose: () => {
        this.connected = false;
      },
      onStompError: () => {
        metrics.stompErrors++;
        if (!restarting) fail(new Error("Unexpected STOMP error"));
      },
      debug: () => {},
    });
    this.client.activate();
    this.poll = setInterval(() => void this.refresh(), 4000);
  }
  async ready(previous = this.connections - 1) {
    const until = Date.now() + 15000;
    while (!(this.connected && this.connections > previous)) {
      if (Date.now() > until)
        throw new Error("Student " + this.index + " reconnect timeout");
      await delay(50);
    }
  }
  offline(blackhole) {
    this.online = false;
    this.offlineAt = performance.now();
    this.oldConnections = this.connections;
    if (blackhole) {
      for (const link of links)
        if (link.id === this.index && !link.drop) {
          link.drop = true;
          link.dropAt = Date.now();
          metrics.blackholes++;
        }
    } else {
      this.client.forceDisconnect();
      metrics.forcedDisconnects++;
    }
  }
  async recover() {
    this.online = true;
    const previous = this.connections;
    this.client.forceDisconnect();
    await this.ready(previous);
    await this.refresh();
    metrics.recoveryMs.push(performance.now() - this.offlineAt);
  }
  async submit(qid, choice, expected = [200]) {
    const start = performance.now();
    const r = await call(
      this,
      "/rooms/" + roomId + "/answer",
      { questionId: qid, answer: choice },
      expected,
    );
    metrics.answerMs.push(performance.now() - start);
    if (r.status === 200) {
      metrics.acceptedAnswerMs.push(performance.now() - start);
      this.apply(r.data);
    }
    return r;
  }
  async stop() {
    this.closed = true;
    clearInterval(this.poll);
    clearTimeout(this.timer);
    await this.client?.deactivate({ force: true });
  }
}
function stats(a) {
  if (!a.length) return {};
  const b = [...a].sort((x, y) => x - y);
  return {
    count: b.length,
    p50: Math.round(b[Math.floor((b.length - 1) * 0.5)]),
    p95: Math.round(b[Math.floor((b.length - 1) * 0.95)]),
    p99: Math.round(b[Math.floor((b.length - 1) * 0.99)]),
    max: Math.round(b.at(-1)),
  };
}
async function checkpoint(status = "running") {
  if (status !== "running") terminalStatus = status;
  if (terminalStatus && status === "running") return;
  const snapshot = {
    ...metrics,
    status,
    elapsedSeconds: Math.round((Date.now() - started) / 1000),
    api: stats(metrics.apiMs),
    answers: stats(metrics.answerMs),
    acceptedAnswers: stats(metrics.acceptedAnswerMs),
    finalReads: stats(metrics.finalReadMs),
    liveReads: stats(metrics.liveReadMs),
    recoveryIncludingOffline: stats(metrics.recoveryMs),
    loadGenerator: {
      eventLoopMaxMs: Math.round(loopDelay.max / 1e6),
      eventLoopP99Ms: Math.round(loopDelay.percentile(99) / 1e6),
      slowGc: gcEvents,
    },
  };
  delete snapshot.apiMs;
  delete snapshot.answerMs;
  delete snapshot.acceptedAnswerMs;
  delete snapshot.finalReadMs;
  delete snapshot.liveReadMs;
  delete snapshot.recoveryMs;
  checkpointWrites = checkpointWrites.then(async () => {
    await writeFile(dir + "/results.json", JSON.stringify(snapshot, null, 2));
    await writeFile(
      "../work/soak-latest.json",
      JSON.stringify({
        directory: dir,
        status,
        completedRounds: metrics.completedRounds,
        elapsedSeconds: snapshot.elapsedSeconds,
      }),
    );
  });
  await checkpointWrites;
}
async function resource() {
  try {
    const { stdout } = await exec(
      "docker",
      [
        "stats",
        "--no-stream",
        "--format",
        "{{json .}}",
        "vju-quiz-test-backend-1",
        "vju-quiz-db-1",
      ],
      { maxBuffer: 200000 },
    );
    metrics.resources.push({
      at: new Date().toISOString(),
      containers: stdout
        .trim()
        .split("\n")
        .map((x) => JSON.parse(x)),
    });
  } catch (e) {
    fail(e);
  }
}
let admin, monitor;
const started = Date.now();
try {
  admin = await session(
    { username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD },
    "/auth/login",
  );
  const catalog = (await call(admin, "/catalog")).data;
  const chapter = catalog.chapters[0].id;
  const source = JSON.parse(
    await readFile("../content/course-2019.json", "utf8"),
  ).questions.slice(0, rounds);
  const rows = source.map((q) => ({
    ...q,
    id: undefined,
    chapterId: chapter,
    imageUrl: "",
    status: "PUBLISHED",
  }));
  await call(admin, "/admin/import/commit", rows);
  const questions = (await call(admin, "/admin/questions")).data;
  const ids = source.map(
    (q) =>
      questions.find((x) => x.text === q.text && x.status === "PUBLISHED").id,
  );
  const quiz = (
    await call(admin, "/admin/quizzes", {
      title: "Soak " + run,
      description: "Disposable 100-player endurance fixture",
      questionIds: ids,
      status: "PUBLISHED",
      timeLimitSeconds: 0,
      questionSeconds,
      shuffle: true,
    })
  ).data;
  roomId = (await call(admin, "/admin/rooms", { quizId: quiz.id })).data.id;
  metrics.roomId = roomId;
  for (let i = 0; i < count; i++) {
    const p = await session({
      name: "Soak student " + String(i + 1).padStart(3, "0"),
    });
    await call(p, "/rooms/" + roomId + "/join", {});
    students.push(new Student(i, p));
  }
  for (const p of students) p.connect();
  await Promise.all(students.map((p) => p.ready(0)));
  await resource();
  await checkpoint();
  monitor = setInterval(() => void checkpoint().catch(fail), 10000);
  console.log(
    JSON.stringify({
      status: "started",
      run,
      roomId,
      players: count,
      rounds,
      minimumMinutes: (rounds * roundMs) / 60000,
    }),
  );
  let previousQuestion = null;
  for (let round = 0; round < rounds; round++) {
    if (fatal) throw fatal;
    const roundStart = Date.now(),
      latencyStart = metrics.answerMs.length,
      acceptedStart = metrics.acceptedAnswerMs.length;
    const opened = (
      await call(
        admin,
        `/admin/rooms/${roomId}/${round === 0 ? "start" : "next"}`,
        {},
      )
    ).data;
    assert.equal(opened.status, "QUESTION");
    const qid = opened.question.id;
    await Promise.all(
      students.map(async (p) => {
        const v = (await call(p, "/rooms/" + roomId)).data;
        p.apply(v);
        assert.equal(v.question.id, qid);
        p.options.set(qid, v.question.options);
      }),
    );
    if (previousQuestion) await students[0].submit(previousQuestion, 0, [400]);
    const allDrop = (round + 1) % 15 === 0;
    const affected = expireAll
      ? students
      : students.filter(
          (p) => !noFaults && (allDrop || (p.index + round * 7) % 100 < 20),
        );
    const blank = expireAll
      ? new Set(students)
      : (round + 1) % 10 === 0
        ? new Set(affected.slice(0, 10))
        : new Set();
    if (!expireAll) for (const p of affected) p.offline((round + 1) % 3 !== 0);
    const normal = students.filter((p) => !affected.includes(p));
    async function answer(p) {
      const choice = (p.index + round) % 4;
      const r = await p.submit(qid, choice);
      assert.equal(r.data.myAnswer, choice);
      p.answers.set(qid, choice);
      metrics.answerAccepted++;
    }
    const checkpointJob =
      forceCheckpoints && round % 5 === 0
        ? (async () => {
            const at = new Date().toISOString(),
              start = performance.now();
            await exec(
              "docker",
              [
                "compose",
                "exec",
                "-T",
                "db",
                "psql",
                "-U",
                "vju",
                "-d",
                "vju_quiz_test",
                "-v",
                "ON_ERROR_STOP=1",
                "-c",
                "CHECKPOINT;",
              ],
              { cwd: ".." },
            );
            metrics.checkpoints.push({
              round: round + 1,
              at,
              elapsedMs: Math.round(performance.now() - start),
            });
          })().catch(fail)
        : Promise.resolve();
    await Promise.all(normal.map(answer));
    await checkpointJob;
    if (!noFaults) await delay(Math.max(0, roundStart + 3000 - Date.now()));
    await Promise.all(
      affected
        .filter((p) => !blank.has(p))
        .map(async (p) => {
          if (!expireAll) await p.recover();
          const v = (await call(p, "/rooms/" + roomId)).data;
          assert.deepEqual(v.question.options, p.options.get(qid));
          metrics.stateChecks++;
          await answer(p);
        }),
    );
    if (blank.size) {
      await delay(
        Math.max(0, opened.deadline + (expireAll ? 1 : 300) - Date.now()),
      );
      await Promise.all(
        [...blank].map(async (p) => {
          if (!expireAll) await p.recover();
          const v = (await call(p, "/rooms/" + roomId)).data;
          assert.equal(v.myAnswer, -1);
          assert.deepEqual(v.question.options, p.options.get(qid));
          await p.submit(qid, 0, [400]);
          metrics.lateChecks++;
          metrics.intentionalBlanks++;
          p.answers.set(qid, -1);
        }),
      );
    }
    const closed = (await call(admin, "/rooms/" + roomId)).data;
    assert.equal(closed.status, "REVEAL");
    assert.equal(closed.answered, 100 - blank.size);
    await Promise.all(
      students.map(async (p) => {
        const v = (await call(p, "/rooms/" + roomId)).data;
        p.apply(v);
        assert.equal(v.myAnswer, p.answers.get(qid));
        assert.deepEqual(v.question.options, p.options.get(qid));
        if (v.myAnswer === v.question.correct) p.expectedCorrect++;
        const ranking = v.ranking.find((x) => x.playerId === p.actor.id);
        assert.equal(ranking.correct, p.expectedCorrect);
        const delta = ranking.durationMs - p.lastDuration;
        assert(delta >= 0 && delta <= questionSeconds * 1000);
        if (blank.has(p)) assert.equal(delta, questionSeconds * 1000);
        p.lastDuration = ranking.durationMs;
        metrics.stateChecks++;
      }),
    );
    for (let burst = 0; burst < extraReadBursts; burst++)
      await Promise.all(students.map((p) => p.refresh()));
    const retry = students.slice(0, 10);
    await Promise.all(
      retry.map(async (p) => {
        await p.submit(qid, (p.index + round + 1) % 4, [400]);
        const v = (await call(p, "/rooms/" + roomId)).data;
        assert.equal(v.myAnswer, p.answers.get(qid));
        assert.equal(
          v.ranking.find((x) => x.playerId === p.actor.id).durationMs,
          p.lastDuration,
        );
        metrics.duplicateChecks++;
      }),
    );
    if ((round + 1) % 10 === 0) {
      await call(students[0], "/admin/questions", undefined, [403]);
      await resource();
    }
    if (round === 49 && !noFaults) {
      restarting = true;
      const before = students.map((p) => p.connections);
      await exec(
        "docker",
        ["compose", "--profile", "test", "restart", "test-backend"],
        { cwd: ".." },
      );
      for (let i = 0; i < 40; i++) {
        try {
          const r = await fetch(base + "/actuator/health", {
            signal: AbortSignal.timeout(1000),
          });
          if (r.ok) break;
        } catch {}
        await delay(500);
      }
      restarting = false;
      await Promise.all(students.map((p, i) => p.ready(before[i])));
      const restored = (await call(admin, "/rooms/" + roomId)).data;
      assert.equal(restored.version, closed.version);
      assert.deepEqual(restored.ranking, closed.ranking);
      metrics.restartPreserved = true;
    }
    await delay(Math.max(0, roundStart + roundMs - Date.now()));
    metrics.completedRounds++;
    metrics.rounds.push({
      round: round + 1,
      elapsedMs: Date.now() - roundStart,
      answers: 100 - blank.size,
      answerCommits: closed.version - opened.version,
      offline: expireAll ? 0 : affected.length,
      answerLatency: stats(metrics.answerMs.slice(latencyStart)),
      acceptedAnswerLatency: stats(
        metrics.acceptedAnswerMs.slice(acceptedStart),
      ),
      connections: students.filter((p) => p.connected).length,
    });
    previousQuestion = qid;
    await checkpoint();
    console.log(
      JSON.stringify({
        round: round + 1,
        elapsedSeconds: Math.round((Date.now() - started) / 1000),
        answers: metrics.answerAccepted,
        connections: students.filter((p) => p.connected).length,
        blackholes: metrics.blackholes,
        closedStale: metrics.staleLinksClosed,
        p95: metrics.rounds.at(-1).answerLatency.p95,
      }),
    );
  }
  const finishStart = performance.now();
  const final = (await call(admin, "/admin/rooms/" + roomId + "/next", {}))
    .data;
  metrics.hostFinishMs = Math.round(performance.now() - finishStart);
  assert.equal(final.status, "FINISHED");
  assert.equal(final.early, false);
  await Promise.all(
    students.map(async (p) => {
      const start = performance.now();
      const v = (await call(p, "/rooms/" + roomId)).data;
      metrics.finalReadMs.push(performance.now() - start);
      assert.equal(v.details.length, 1);
      const details = v.details[0];
      assert.equal(details.playerId, p.actor.id);
      assert.equal(details.questions.length, rounds);
      for (const x of details.questions) {
        assert.equal(x.answer, p.answers.get(x.question.id));
        assert.deepEqual(x.question.options, p.options.get(x.question.id));
      }
      const rank = v.ranking.find((x) => x.playerId === p.actor.id);
      assert.equal(rank.correct, p.expectedCorrect);
      assert.equal(rank.durationMs, p.lastDuration);
    }),
  );
  if (fatal) throw fatal;
  metrics.finalVerified = true;
  if (sloMs > 0) {
    assert(
      stats(metrics.answerMs).max < sloMs,
      "Answer-response maximum exceeds SLO",
    );
    assert(
      expireAll || stats(metrics.acceptedAnswerMs).max < sloMs,
      "Accepted-answer maximum exceeds SLO",
    );
    for (const r of metrics.rounds)
      assert(
        expireAll || r.acceptedAnswerLatency.max < sloMs,
        `Round ${r.round} maximum exceeds SLO`,
      );
    assert(
      stats(metrics.finalReadMs).max < sloMs,
      "Student final-result maximum exceeds SLO",
    );
    assert(
      stats(metrics.liveReadMs).max < sloMs,
      "Room state-read maximum exceeds SLO",
    );
    assert(metrics.hostFinishMs < sloMs, "Host finish exceeds SLO");
    metrics.sloPassed = true;
  }
  await resource();
  if (fatal) throw fatal;
  await checkpoint("passed");
  console.log("PASS soak " + run);
} catch (e) {
  fail(e);
  await checkpoint("failed");
  process.exitCode = 1;
} finally {
  stopping = true;
  loopDelay.disable();
  gcObserver.disconnect();
  clearInterval(monitor);
  await Promise.all(students.map((p) => p.stop()));
  for (const l of links) {
    l.down.destroy();
    l.up.destroy();
  }
  proxy.close();
  if (admin) await call(admin, "/auth/logout", {}).catch(() => {});
}
