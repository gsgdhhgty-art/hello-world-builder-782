import { db, hasLocalDb } from "./db";
import { isOnline } from "./sync";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Read from the cloud when reachable and mirror into the local database;
 * fall back to the local snapshot whenever the network is unavailable.
 */
export async function localFirst<T extends Record<string, any>>(
  table: string,
  fetcher: () => Promise<T[]>,
  toLocal?: (row: T) => Record<string, any>,
): Promise<T[]> {
  if (isOnline()) {
    try {
      const rows = await fetcher();
      if (hasLocalDb()) {
        await db()
          .table(table)
          .bulkPut(rows.map((r) => (toLocal ? toLocal(r) : r)));
      }
      return rows;
    } catch {
      // fall through to the local snapshot
    }
  }
  if (!hasLocalDb()) return [];
  return (await db().table(table).toArray()) as T[];
}
