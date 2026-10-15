import { test, expect } from "@playwright/test";
import path from "node:path";
const evidence = path.resolve("../work");
test("student practice, saved progress, result, leaderboard and mobile layout", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Khám phá các chương" }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(evidence, "desktop-home.png"),
    fullPage: true,
  });
  await page.getByLabel("Tên của bạn", { exact: true }).fill("Minh Anh");
  await page
    .getByRole("button", { name: "Làm bài", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/attempt\//);
  await expect(page.getByText("Tiến độ của bạn")).toBeVisible();
  await page.locator(".answer").first().click();
  await expect(page.locator(".answer").first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Xem lại sau", exact: true }).click();
  await page.reload();
  await expect(page.locator(".answer").first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "Đã đánh dấu" })).toBeVisible();
  await page.screenshot({
    path: path.join(evidence, "desktop-practice.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Câu tiếp", exact: true }).click();
  await page.locator(".answer").nth(1).click();
  await page.getByRole("button", { name: "Nộp bài", exact: true }).click();
  await page.getByRole("button", { name: "Xác nhận nộp bài" }).click();
  await expect(
    page.getByRole("heading", { name: "Bạn đã hoàn thành!" }),
  ).toBeVisible();
  await page.locator(".review summary").first().click();
  await expect(
    page.locator(".review").first().getByText("Giải thích:", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(evidence, "desktop-result.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: "Xem thứ hạng" }).click();
  await expect(page.locator("tr.mine")).toContainText("Minh Anh");
  await page.getByRole("link", { name: "Lịch sử", exact: true }).click();
  await expect(page.locator(".history-row")).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByLabel("Tên của bạn")).toHaveValue("Minh Anh");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: path.join(evidence, "mobile-home.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: /01 Tổng quan/ }).click();
  await page.getByRole("button", { name: "Luyện ngay" }).click();
  await expect(page.locator(".answers")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: path.join(evidence, "mobile-practice.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("admin content screens and synchronous multiplayer", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/admin");
  await page.getByLabel("Tên đăng nhập", { exact: true }).fill("admin");
  await page
    .getByLabel("Mật khẩu", { exact: true })
    .fill(process.env.ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Nhịp học tập hôm nay" }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(evidence, "admin-dashboard.png"),
    fullPage: true,
  });
  for (const [link, heading] of [
    ["Chương học", "Chương học"],
    ["Ngân hàng câu hỏi", "Ngân hàng câu hỏi"],
    ["Bộ quiz", "Bộ quiz"],
    ["Nhập Excel", "Nhập câu hỏi từ Excel"],
    ["Tài khoản", "Tài khoản quản lý"],
    ["Báo cáo", "Thống kê & báo cáo"],
  ]) {
    await page
      .locator(".admin-sidebar")
      .getByRole("link", { name: link, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
    await expect(page.locator(".error[role=alert]")).toHaveCount(0);
  }
  await page
    .locator(".admin-sidebar")
    .getByRole("link", { name: "Chương học", exact: true })
    .click();
  const chapterTitle="Chương thử giao diện " + Date.now();
  await page.getByRole("button", { name: "Thêm chương" }).click();
  await page
    .getByLabel("Tên chương", { exact: true })
    .fill(chapterTitle);
  await page
    .getByLabel("Mô tả", { exact: true })
    .fill("Dữ liệu kiểm thử giao diện");
  await page.getByRole("button", { name: "Lưu chương" }).click();
  await expect(
    page.getByText(chapterTitle, { exact: true }),
  ).toBeVisible();
  await page
    .locator(".admin-sidebar")
    .getByRole("link", { name: "Nhập Excel", exact: true })
    .click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Tải mẫu Excel" }).click();
  const download = await downloadPromise;
  const excel = path.join(evidence, "vju-cau-hoi.xlsx");
  await download.saveAs(excel);
  await page.locator("input[type=file]").setInputFiles(excel);
  await expect(
    page.getByRole("heading", { name: "1 câu cần kiểm tra" }),
  ).toBeVisible();
  await expect(page.getByText("Hợp lệ", { exact: true })).toBeVisible();
  await page
    .locator(".admin-sidebar")
    .getByRole("link", { name: "Phòng chơi", exact: true })
    .click();
  await page.getByRole("combobox", { name: "Bộ quiz", exact: true }).selectOption({ index: 1 });
  await page.getByRole("button", { name: "Tạo phòng mới" }).click();
  await expect(page).toHaveURL(/\/room\//);
  const code = page.url().split("/").pop()!;
  const studentContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const student = await studentContext.newPage();
  student.on("pageerror", (e) => errors.push(e.message));
  await student.goto("/?room=" + code);
  await student.getByLabel("Tên của bạn", { exact: true }).fill("Hoàng Nam");
  await student.getByRole("button", { name: "Vào phòng", exact: true }).click();
  await expect(
    student.getByText("Chờ chủ trì bắt đầu. Bạn đã sẵn sàng!"),
  ).toBeVisible();
  await expect(page.getByText("Hoàng Nam", { exact: true })).toBeVisible();
  await expect(page.locator(".connection")).toContainText("Trực tiếp");
  await expect(student.locator(".connection")).toContainText("Trực tiếp");
  await page.screenshot({
    path: path.join(evidence, "room-lobby.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Bắt đầu chơi" }).click();
  await expect(student.locator(".answers")).toBeVisible();
  await student.reload();
  await expect(student.locator(".answers")).toBeVisible();
  await student.locator(".answer").first().click();
  await expect(
    page.getByText("Đã đóng câu hỏi", { exact: true }),
  ).toBeVisible();
  await expect(
    student.getByText("Thứ hạng hiện tại", { exact: true }),
  ).toBeVisible();
  await student.screenshot({
    path: path.join(evidence, "mobile-live.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Câu tiếp theo" }).click();
  await expect(student.getByText("Câu 2 / 4", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Kết thúc sớm" }).click();
  await page
    .getByRole("button", { name: "Kết thúc phòng", exact: true })
    .click();
  await expect(
    student.getByRole("heading", { name: "Một hành trình thật tuyệt!" }),
  ).toBeVisible();
  await expect(
    student.getByText("Phòng đã kết thúc sớm", { exact: false }),
  ).toBeVisible();
  await expect(student.locator(".podium")).toContainText("Hoàng Nam");
  await page.screenshot({
    path: path.join(evidence, "room-result.png"),
    fullPage: true,
  });
  await studentContext.close();
  expect(errors).toEqual([]);
});
