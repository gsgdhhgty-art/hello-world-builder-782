import { supabase } from "@/integrations/supabase/client";
import { db, deviceId, getMeta, hasLocalDb, setMeta, type LocalSale, type SyncOp } from "./db";

/**
 * Two-way sync engine.
 *  cloud -> local : pullAll()
 *  local -> cloud : processQueue() (idempotent, exponential backoff, never drops data)
 */

const PULLED_TABLES = [
  "categories",
  "products",
  "customers",
  "suppliers",
  "inventory",
  "branches",
  "warehouses",
  "registers",
  "shifts",
  "expenses",
] as const;

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

export async function pullAll(): Promise<void> {
  if (!hasLocalDb()) return;
  const local = db();
  for (const table of PULLED_TABLES) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from(table as any).select("*") as any);
    if (error || !data) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (data as any[]).map((r) =>
      table === "inventory" ? { ...r, id: `${r.product_id}:${r.warehouse_id}` } : r,
    );
    // Master data follows the server version; append-only transactional data is never overwritten.
    await local.table(table).bulkPut(rows);
  }

  const { data: cloudSales } = await supabase
    .from("sales")
    .select(
      "id, client_txn_id, invoice_no, total, subtotal, discount, tax, paid, change_due, payment_method, customer_id, cashier_id, status, created_at, local_created_at",
    )
    .order("created_at", { ascending: false })
    .limit(300);
  if (cloudSales) {
    for (const s of cloudSales) {
      const txn = s.client_txn_id ?? s.id;
      const existing = await local.sales.where("client_txn_id").equals(txn).first();
      if (existing) await local.sales.delete(existing.id);
      await local.sales.put({
        id: s.id,
        client_txn_id: txn,
        invoice_no: s.invoice_no,
        total: Number(s.total),
        subtotal: Number(s.subtotal),
        discount: Number(s.discount),
        tax: Number(s.tax),
        paid: Number(s.paid),
        change_due: Number(s.change_due),
        payment_method: s.payment_method,
        customer_id: s.customer_id,
        cashier_id: s.cashier_id,
        status: s.status,
        sync_status: "SYNCED",
        local_created_at: s.local_created_at ?? s.created_at,
        created_at: s.created_at,
        items: [],
      });
    }
  }
  await setMeta("last_pull_at", new Date().toISOString());
}

export async function lastPullAt(): Promise<string | undefined> {
  if (!hasLocalDb()) return undefined;
  return getMeta<string>("last_pull_at");
}

export async function enqueue(
  entity: string,
  operation: SyncOp["operation"],
  payload: unknown,
  opts: { entity_id?: string; idempotency_key?: string } = {},
): Promise<void> {
  const now = new Date().toISOString();
  await db().sync_queue.put({
    id: crypto.randomUUID(),
    entity,
    entity_id: opts.entity_id ?? null,
    operation,
    payload,
    idempotency_key: opts.idempotency_key ?? crypto.randomUUID(),
    device_id: deviceId(),
    created_at: now,
    retry_count: 0,
    next_attempt_at: now,
    status: "PENDING",
    last_error: null,
  });
}

/** Non-retryable server validation failures: keep the record, flag it for the admin. */
function isConflict(message: string): boolean {
  return [
    "invalid product",
    "invalid customer",
    "invalid quantity",
    "no permission",
    "cart is empty",
    "invalid payment method",
    "credit sale requires a customer",
    "return quantity exceeds sold quantity",
    "invalid sale item",
    "sale not found",
    "no register configured",
    "invalid return quantity",
  ].some((m) => message.includes(m));
}

async function runOp(op: SyncOp): Promise<void> {
  if (op.entity === "sale") {
    const { data, error } = await supabase.rpc("create_sale", {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _payload: op.payload as any,
    });
    if (error) throw new Error(error.message);
    const res = data as { sale_id: string; invoice_no: string; total: number; change_due: number };
    const txn = (op.payload as { client_txn_id: string }).client_txn_id;
    const local = await db().sales.where("client_txn_id").equals(txn).first();
    if (local) {
      await db().sales.delete(local.id);
      await db().sales.put({
        ...local,
        id: res.sale_id,
        invoice_no: res.invoice_no,
        total: Number(res.total),
        change_due: Number(res.change_due),
        sync_status: "SYNCED",
      });
    }
    return;
  }
  if (op.entity === "shift_open") {
    const p = op.payload as {
      opening_cash: number;
      register_id: string | null;
      client_txn_id: string;
    };
    const args: { _opening_cash: number; _client_txn_id: string; _register_id?: string } = {
      _opening_cash: p.opening_cash,
      _client_txn_id: p.client_txn_id,
    };
    if (p.register_id) args._register_id = p.register_id;
    const { error } = await supabase.rpc("open_shift", args);
    if (error) throw new Error(error.message);
    return;
  }
  if (op.entity === "return") {
    const p = op.payload as { sale_id: string; items: unknown; reason?: string };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const args: any = { _sale_id: p.sale_id, _items: p.items };
    if (p.reason) args._reason = p.reason;
    const { error } = await supabase.rpc("create_return", args);
    if (error) throw new Error(error.message);
    return;
  }
  if (op.entity === "customer") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from("customers").insert(op.payload as any);
    if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    return;
  }
  if (op.entity === "expense") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from("expenses").insert(op.payload as any);
    if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    return;
  }
  throw new Error(`unknown sync entity: ${op.entity}`);
}

let running = false;

export async function processQueue(): Promise<void> {
  if (!hasLocalDb() || running || !isOnline()) return;
  running = true;
  try {
    const now = new Date().toISOString();
    const ops = (await db().sync_queue.toArray())
      .filter((o) => o.status === "PENDING" || o.status === "FAILED")
      .filter((o) => o.next_attempt_at <= now)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));

    for (const op of ops) {
      await db().sync_queue.update(op.id, { status: "SYNCING" });
      try {
        await runOp(op);
        await db().sync_queue.delete(op.id);
      } catch (e) {
        const message = e instanceof Error ? e.message : "sync failed";
        const retry = op.retry_count + 1;
        const conflict = isConflict(message);
        if (conflict) {
          const txn = (op.payload as { client_txn_id?: string }).client_txn_id;
          if (txn) {
            const local = await db().sales.where("client_txn_id").equals(txn).first();
            if (local) await db().sales.update(local.id, { sync_status: "CONFLICT" });
          }
        }
        const delayMs = Math.min(5000 * 2 ** Math.min(retry, 6), 5 * 60_000);
        await db().sync_queue.update(op.id, {
          status: conflict ? "CONFLICT" : "FAILED",
          retry_count: retry,
          last_error: message,
          next_attempt_at: new Date(Date.now() + delayMs).toISOString(),
        });
        if (!isOnline()) break;
      }
    }
  } finally {
    running = false;
  }
}

export async function syncNow(): Promise<void> {
  if (!isOnline()) return;
  await processQueue();
  await pullAll();
}

/** Local stock snapshot per product across all warehouses. */
export async function localStockMap(): Promise<Record<string, number>> {
  const map: Record<string, number> = {};
  if (!hasLocalDb()) return map;
  for (const row of await db().inventory.toArray()) {
    map[row["product_id"]] = (map[row["product_id"]] ?? 0) + Number(row["quantity"]);
  }
  return map;
}

/** Apply an offline sale locally: invoice + stock + queue entry, all without internet. */
export async function recordLocalSale(sale: LocalSale): Promise<void> {
  const local = db();
  await local.sales.put(sale);
  for (const item of sale.items) {
    const product = await local.products.get(item.product_id);
    if (!product?.["track_stock"]) continue;
    const rows = await local.inventory.where("product_id").equals(item.product_id).toArray();
    const row = rows[0];
    if (row) {
      await local.inventory.update(row["id"], {
        quantity: Number(row["quantity"]) - item.quantity,
      });
    }
  }
}
