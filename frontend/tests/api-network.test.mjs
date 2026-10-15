import test from "node:test";
import assert from "node:assert/strict";
import { api, setCsrf } from "../src/lib/api.ts";

test("a stalled fetch times out, and a subsequent request can recover", async () => {
  const originalFetch = globalThis.fetch,
    originalTimeout = AbortSignal.timeout;
  let signal, timeoutMs;
  AbortSignal.timeout = (ms) => {
    timeoutMs = ms;
    return originalTimeout(30);
  };
  globalThis.fetch = (_url, options) =>
    new Promise((_resolve, reject) => {
      signal = options.signal;
      if (signal)
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
    });
  const keepAlive = setInterval(() => {}, 100);
  try {
    const pending = api("/rooms/123456");
    assert(
      signal,
      "Every API fetch needs a deadline so refresh cannot remain locked after network loss",
    );
    await assert.rejects(pending, /phản hồi quá lâu/);
    assert.equal(timeoutMs, 15000);
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ version: 2, status: "QUESTION" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    assert.equal((await api("/rooms/123456")).version, 2);
  } finally {
    clearInterval(keepAlive);
    globalThis.fetch = originalFetch;
    AbortSignal.timeout = originalTimeout;
  }
});

test("a truncated success response is rejected instead of becoming fake room state", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('{"version":', { status: 200 });
    await assert.rejects(api("/rooms/123456"), /Không thể đọc phản hồi/);
  } finally {
    globalThis.fetch = original;
  }
});

test("deadline also covers a stalled response body", async () => {
  const original = globalThis.fetch,
    timeout = AbortSignal.timeout;
  AbortSignal.timeout = () => timeout(30);
  const keepAlive = setInterval(() => {}, 100);
  try {
    globalThis.fetch = async (_url, { signal }) => ({
      ok: true,
      json: () =>
        new Promise((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          }),
        ),
    });
    await assert.rejects(api("/rooms/123456"), /phản hồi quá lâu/);
  } finally {
    clearInterval(keepAlive);
    globalThis.fetch = original;
    AbortSignal.timeout = timeout;
  }
});

test("Excel upload keeps a longer bounded deadline", async () => {
  const original = globalThis.fetch,
    timeout = AbortSignal.timeout;
  let deadline;
  AbortSignal.timeout = (ms) => {
    deadline = ms;
    return timeout(1000);
  };
  try {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ actor: { csrf: "fixture" }, rows: [] }), {
        status: 200,
      });
    await api("/admin/import/preview", "POST", new FormData());
    assert.equal(deadline, 120000);
  } finally {
    globalThis.fetch = original;
    AbortSignal.timeout = timeout;
  }
});

test("the CSRF bootstrap shares the deadline and a timed-out write is not replayed", async () => {
  const originalFetch = globalThis.fetch,
    originalTimeout = AbortSignal.timeout;
  const requests = [];
  setCsrf("");
  AbortSignal.timeout = () => originalTimeout(30);
  globalThis.fetch = (url, { signal }) => {
    requests.push(url);
    return new Promise((_resolve, reject) =>
      signal.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      }),
    );
  };
  const keepAlive = setInterval(() => {}, 100);
  try {
    await assert.rejects(
      api("/rooms/123456/answer", "POST", { questionId: "fixture", answer: 0 }),
      /phản hồi quá lâu/,
    );
    assert.deepEqual(requests, ["/api/session"]);
  } finally {
    clearInterval(keepAlive);
    globalThis.fetch = originalFetch;
    AbortSignal.timeout = originalTimeout;
    setCsrf("");
  }
});
