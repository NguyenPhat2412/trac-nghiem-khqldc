import { test, expect } from "@playwright/test";
import path from "node:path";

test("instant wrong-answer feedback, first-choice lock and ranked copy notice", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const login = await page.request.post("/api/auth/login", {
    data: {
      username: process.env.ADMIN_USERNAME || "admin",
      password: process.env.ADMIN_PASSWORD,
    },
  });
  expect(login.ok()).toBeTruthy();
  const admin = await login.json();
  const quizzes = await (await page.request.get("/api/admin/quizzes")).json();
  const keys = new Map<string, string>();
  for (const q of quizzes.filter(
    (x: { status: string }) => x.status === "PUBLISHED",
  ))
    for (const item of q.questions)
      keys.set(item.id, item.options[item.correct]);
  await page.request.post("/api/auth/logout", {
    headers: { "X-CSRF-Token": admin.csrf },
    data: {},
  });
  await page.goto("/");
  await page
    .getByLabel("Tên của bạn", { exact: true })
    .fill("Kiểm thử phản hồi");
  const start = page.waitForResponse(
    (r) => r.url().endsWith("/api/attempts") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Học từng câu · Hiện đáp án ngay" })
    .first()
    .click();
  const attempt = await (await start).json();
  expect(attempt.ranked).toBe(false);
  expect(attempt.questions[0].correct).toBeUndefined();
  const q = attempt.questions[0];
  const wrong = q.options.findIndex((x: string) => x !== keys.get(q.id));
  await page.locator(".answer").nth(wrong).click();
  await expect(
    page.getByText("Chưa chính xác.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".instant-feedback")).toContainText(
    keys.get(q.id)!,
  );
  await expect(page.locator(".answer.correct")).toHaveCount(1);
  await expect(page.locator(".answer.wrong")).toHaveCount(1);
  await expect(page.locator(".answer:not([disabled])")).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByText("Chưa chính xác.", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: path.resolve("../work/instant-feedback-mobile.png"),
    fullPage: true,
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Làm bài", exact: true })
    .first()
    .click();
  await expect(page.locator(".fair-play-notice")).toBeVisible();
  await page.locator(".protected-question h2").click({ button: "right" });
  await expect(
    page.getByText("Sao chép nội dung đang được hạn chế trong lượt làm này."),
  ).toBeVisible();
  await page.screenshot({
    path: path.resolve("../work/fair-play-mobile.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
