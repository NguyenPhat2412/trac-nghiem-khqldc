let csrf = "";
export function setCsrf(value: string) {
  csrf = value;
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
  options?: { keepalive?: boolean },
): Promise<T> {
  if (
    method !== "GET" &&
    !csrf &&
    !["/session", "/auth/login"].includes(path)
  ) {
    const res = await fetch("/api/session");
    const data = await res.json();
    csrf = data.actor?.csrf || "";
  }
  const form = body instanceof FormData;
  const res = await fetch("/api" + path, {
    method,
    credentials: "include",
    cache: "no-store",
    keepalive: options?.keepalive,
    headers: {
      ...(!form && method !== "GET"
        ? { "Content-Type": "application/json" }
        : {}),
      ...(method !== "GET" ? { "X-CSRF-Token": csrf } : {}),
    },
    body: body === undefined ? undefined : form ? body : JSON.stringify(body),
  });
  const data = await res
    .json()
    .catch(() => ({ message: "Không thể đọc phản hồi từ máy chủ." }));
  if (!res.ok)
    throw new Error(
      data.message || "Không thể hoàn thành yêu cầu. Vui lòng thử lại.",
    );
  if (data.csrf) csrf = data.csrf;
  return data as T;
}
export const duration = (ms: number) => {
  const sec = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
};
export const date = (ms: number) => new Date(ms).toLocaleString("vi-VN");
export const statusLabel = (s: string) =>
  ({
    DRAFT: "Bản nháp",
    PUBLISHED: "Đã xuất bản",
    ARCHIVED: "Đã ẩn",
    LOBBY: "Đang chờ",
    QUESTION: "Đang trả lời",
    REVEAL: "Xem đáp án",
    FINISHED: "Đã kết thúc",
    ACTIVE: "Đang làm",
    DONE: "Hoàn thành",
  })[s] || s;
