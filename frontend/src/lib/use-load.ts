"use client";
import { useEffect, useState } from "react";
import { api } from "./api";
export function useLoad<T>(path: string, initial: T) {
  const [data, setData] = useState<T>(initial);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  async function reload() {
    try {
      setData(await api<T>(path));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void reload();
  }, [path]);
  return { data, setData, error, setError, loading, reload };
}
