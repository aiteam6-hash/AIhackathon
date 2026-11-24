"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store/store";

interface Result<T> {
  key: string;
  data?: T;
  error?: string;
}

/**
 * Runs a service call and re-runs it when `deps` change, when `reload()` is called,
 * or after any write to the data store. Keeps the previous data on screen while refreshing,
 * so lists do not flash back to skeletons after every action.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const tick = useStore((s) => s.tick);
  const [manual, setManual] = useState(0);
  const [res, setRes] = useState<Result<T>>({ key: "" });
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  const key = `${JSON.stringify(deps)}|${tick}|${manual}`;

  useEffect(() => {
    let live = true;
    fnRef
      .current()
      .then((data) => live && setRes({ key, data }))
      .catch((e: unknown) => live && setRes((p) => ({ key, data: p.data, error: e instanceof Error ? e.message : "Something went wrong." })));
    return () => {
      live = false;
    };
  }, [key]);

  const reload = useCallback(() => {
    setRes((p) => ({ key: "", data: p.data }));
    setManual((m) => m + 1);
  }, []);

  const settled = res.key === key;
  return {
    data: res.error && settled ? undefined : res.data,
    error: settled ? res.error : undefined,
    loading: !settled,
    reload,
  };
}
