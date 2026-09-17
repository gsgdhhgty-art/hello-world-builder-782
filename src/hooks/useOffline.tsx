import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { hasLocalDb, db } from "@/lib/offline/db";
import { isOnline, lastPullAt, processQueue, pullAll, syncNow } from "@/lib/offline/sync";

interface OfflineState {
  online: boolean;
  pending: number;
  conflicts: number;
  lastPull: string | undefined;
  syncing: boolean;
  sync: () => Promise<void>;
}

const OfflineContext = createContext<OfflineState>({
  online: true,
  pending: 0,
  conflicts: 0,
  lastPull: undefined,
  syncing: false,
  sync: async () => {},
});

export function OfflineProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [conflicts, setConflicts] = useState(0);
  const [lastPull, setLastPull] = useState<string | undefined>();
  const [syncing, setSyncing] = useState(false);

  const refreshCounters = useCallback(async () => {
    if (!hasLocalDb()) return;
    const ops = await db().sync_queue.toArray();
    setPending(ops.filter((o) => o.status !== "CONFLICT").length);
    setConflicts(ops.filter((o) => o.status === "CONFLICT").length);
    setLastPull(await lastPullAt());
  }, []);

  const sync = useCallback(async () => {
    if (!hasLocalDb() || !isOnline()) return;
    setSyncing(true);
    try {
      await syncNow();
    } finally {
      setSyncing(false);
      await refreshCounters();
    }
  }, [refreshCounters]);

  useEffect(() => {
    setOnline(navigator.onLine);
    void sync();
    void refreshCounters();

    const goOnline = () => {
      setOnline(true);
      void sync();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    const timer = window.setInterval(() => {
      if (!navigator.onLine) return;
      void processQueue().then(() => refreshCounters());
    }, 20_000);
    const pullTimer = window.setInterval(() => {
      if (navigator.onLine) void pullAll().then(() => refreshCounters());
    }, 120_000);

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.clearInterval(timer);
      window.clearInterval(pullTimer);
    };
  }, [sync, refreshCounters]);

  return (
    <OfflineContext.Provider value={{ online, pending, conflicts, lastPull, syncing, sync }}>
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline(): OfflineState {
  return useContext(OfflineContext);
}
