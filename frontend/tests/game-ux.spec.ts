import { test, expect } from "@playwright/test";
import path from "node:path";

test("game controls, keyboard answers, reduced effects and accessible submit dialog", async ({
  page,
}) => {
  const errors: string[] = [];
  await page.addInitScript(() => {
    const original = AudioContext.prototype.createOscillator;
    (window as unknown as { createdTones: number }).createdTones = 0;
    AudioContext.prototype.createOscillator = function () {
      (window as unknown as { createdTones: number }).createdTones++;
      return original.call(this);
    };
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator(".course-stats")).toBeVisible();
  await page
    .getByLabel("Tên của bạn", { exact: true })
    .fill("Kiểm thử trải nghiệm");
  await page
    .getByRole("button", { name: "Học từng câu · Hiện đáp án ngay" })
    .first()
    .click();
  await expect(page.locator(".answers")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Âm thanh Tắt" }),
  ).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Phím 1–4 Tắt" }).click();
  await page.keyboard.press("1");
  await expect(page.locator(".instant-feedback")).toBeVisible();
  await expect(page.locator(".answer").first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".answer:enabled")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window as unknown as { createdTones: number }).createdTones,
    ),
  ).toBe(0);
  await page.getByRole("button", { name: "Âm thanh Tắt" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { createdTones: number }).createdTones,
      ),
    )
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Âm thanh Bật" }).click();
  await page.getByRole("button", { name: "Hiệu ứng Bật" }).click();
  expect(
    await page
      .locator(".instant-feedback")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  await page.getByRole("button", { name: "Câu tiếp", exact: true }).click();
  await page.getByRole("button", { name: "Nộp bài", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Sẵn sàng nộp bài?" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("2");
  await expect(page.locator(".answer[aria-pressed=true]")).toHaveCount(0);
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((el) => el.contains(document.activeElement)),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Hiệu ứng Tắt" }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(
    page.getByRole("button", { name: "Phím 1–4 Bật" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: path.resolve("../work/game-controls-mobile.png"),
  });
  expect(errors).toEqual([]);
});

test("offline choices stay unsent, return synchronizes and failed save is not shown as saved", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Tên của bạn", { exact: true })
    .fill("Kiểm thử mất mạng");
  await page
    .getByRole("button", { name: "Làm bài", exact: true })
    .first()
    .click();
  await expect(page.locator(".answers")).toBeVisible();
  await context.setOffline(true);
  await expect(page.locator(".network-banner")).toContainText("Mất kết nối");
  await expect(page.locator(".answer:enabled")).toHaveCount(0);
  await context.setOffline(false);
  await expect(page.locator(".network-banner")).toHaveCount(0);
  await expect(page.locator(".answer:enabled")).toHaveCount(4);
  await page.route("**/api/attempts/*/answer", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Kiểm thử lưu thất bại" }),
    }),
  );
  await page.locator(".answer").first().click();
  await expect(page.locator(".error[role=alert]")).toContainText(
    "Kiểm thử lưu thất bại",
  );
  await expect(page.locator(".question-nav")).toContainText(
    "Chưa xác nhận lưu",
  );
  await expect(page.locator(".answer[aria-pressed=true]")).toHaveCount(0);
  await page.unroute("**/api/attempts/*/answer");
  await page.locator(".answer").first().click();
  await expect(page.locator(".answer").first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".question-nav")).toContainText(
    "Đã lưu trên hệ thống",
  );
});

test("fullscreen exit is recorded without punishment and protected content follows visibility", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Tên của bạn", { exact: true })
    .fill("Kiểm thử tập trung");
  await page
    .getByRole("button", { name: "Làm bài", exact: true })
    .first()
    .click();
  await expect(page.locator(".fair-play-notice")).toBeVisible();
  await page
    .getByRole("button", { name: "Toàn màn hình", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => Boolean(document.fullscreenElement)))
    .toBe(true);
  const event = page.waitForResponse(
    (r) =>
      r.url().endsWith("/integrity") &&
      r.request().postDataJSON()?.kind === "FULLSCREEN_EXIT",
  );
  await page.getByRole("button", { name: "Thu nhỏ", exact: true }).click();
  expect((await event).ok()).toBe(true);
  await expect(page.locator(".fair-play-warning")).toContainText(
    "không tự trừ điểm",
  );
  await page.getByRole("button", { name: "Ẩn thông báo tập trung" }).click();
  await expect(page.locator(".fair-play-warning")).toHaveCount(0);
  // Simulate the browser notification to verify the hook; this does not prove cheat detection.
  const hidden = page.waitForResponse(
    (r) =>
      r.url().endsWith("/integrity") &&
      r.request().postDataJSON()?.kind === "TAB_HIDDEN",
  );
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect((await hidden).ok()).toBe(true);
  await expect(page.locator(".protected-question")).toHaveAttribute(
    "data-concealed",
    "true",
  );
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator(".protected-question")).toHaveAttribute(
    "data-concealed",
    "false",
  );
  await page.locator(".answer").first().click();
  await expect(page.locator(".answer").first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("system reduced motion disables decorative animation by default", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".game-root")).toHaveAttribute(
    "data-effects",
    "off",
  );
  expect(
    await page
      .locator(".chapter")
      .first()
      .evaluate((el) => getComputedStyle(el).transitionDuration),
  ).toBe("0s");
});

test("late recovery response cannot erase a newer saved answer", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Tên của bạn", { exact: true })
    .fill("Kiểm thử phản hồi chậm");
  await page
    .getByRole("button", { name: "Làm bài", exact: true })
    .first()
    .click();
  await expect(page.locator(".answers")).toBeVisible();
  const attemptId = page.url().split("/").pop();
  const stale = await (
    await page.request.get(`/api/attempts/${attemptId}`)
  ).json();
  let release = () => {};
  let recoveryStarted = false;
  const paused = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/api/attempts/${attemptId}`, async (route) => {
    recoveryStarted = true;
    await paused;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(stale),
    });
  });
  await page.route(
    `**/api/attempts/${attemptId}/answer`,
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: '{"message":"Save interrupted"}',
      }),
    { times: 1 },
  );
  await page.locator(".answer").first().click();
  await expect.poll(() => recoveryStarted).toBe(true);
  await page.locator(".answer").nth(1).click();
  await expect(page.locator(".answer").nth(1)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const recovered = page.waitForResponse((r) =>
    r.url().endsWith(`/attempts/${attemptId}`),
  );
  release();
  await recovered;
  await expect(page.locator(".answer").nth(1)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const actual = await (
    await page.request.get(`/api/attempts/${attemptId}`)
  ).json();
  expect(actual.answers[stale.questions[0].id]).toBe(1);
  await expect(page.locator(".answer").nth(1)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
