"use client";
import { usePathname } from "next/navigation";
import { Practice, HistoryPage, Leaderboard } from "./practice";
import dynamic from "next/dynamic";
const RoomPage = dynamic(() => import("./room").then((m) => m.RoomPage));
const Admin = dynamic(() => import("./admin").then((m) => m.Admin));
import { Empty } from "./shared";
export function Routes() {
  const path = usePathname();
  const parts = path.split("/");
  if (parts[1] === "attempt" && parts[2])
    return <Practice key={parts[2]} id={parts[2]} />;
  if (parts[1] === "room" && parts[2])
    return <RoomPage key={parts[2]} code={parts[2]} />;
  if (path === "/history") return <HistoryPage />;
  if (path === "/leaderboard") return <Leaderboard />;
  if (parts[1] === "admin") return <Admin />;
  return <Empty>Không tìm thấy trang này.</Empty>;
}
