import Dexie, { type Table } from "dexie";

/** Local-first database. All operational data lives here so the app runs with no internet. */

export type SyncStatus = "PENDING" | "SYNCING" | "SYNCED" | "FAILED" | "CONFLICT";

export interface SyncOp {
  id: string;
  entity: string;
  entity_id: string | null;
  operation: "CREATE" | "UPDATE" | "DELETE";
  payload: unknown;
  idempotency_key: string;
  device_id: string;
  created_at: string;
  retry_count: number;
  next_attempt_at: string;
  status: SyncStatus;
  last_error: string | null;
}

export interface LocalSale {
  id: string;
  client_txn_id: string;
  invoice_no: string;
  total: number;
  subtotal: number;
  discount: number;
  tax: number;
  paid: number;
  change_due: number;
  payment_method: string;
  customer_id: string | null;
  cashier_id: string | null;
  status: string;
  sync_status: SyncStatus;
  local_created_at: string;
  created_at: string;
  items: Array<{
    product_id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    discount: number;
    tax: number;
    line_total: number;
  }>;
}

export interface HeldOrder {
  id: string;
  label: string;
  created_at: string;
  lines: Array<{ product_id: string; quantity: number; discount: number }>;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

class PosDatabase extends Dexie {
  products!: Table<Row, string>;
  categories!: Table<Row, string>;
  customers!: Table<Row, string>;
  suppliers!: Table<Row, string>;
  inventory!: Table<Row, string>;
  branches!: Table<Row, string>;
  warehouses!: Table<Row, string>;
  registers!: Table<Row, string>;
  shifts!: Table<Row, string>;
  expenses!: Table<Row, string>;
  purchase_orders!: Table<Row, string>;
  purchase_order_items!: Table<Row, string>;
  sales!: Table<LocalSale, string>;
  held_orders!: Table<HeldOrder, string>;
  sync_queue!: Table<SyncOp, string>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super("kashir_offline");
    this.version(1).stores({
      products: "id, name, barcode, sku, category_id",
      categories: "id, name",
      customers: "id, name, phone",
      suppliers: "id, name",
      inventory: "id, product_id, warehouse_id",
      branches: "id, name",
      warehouses: "id, branch_id",
      registers: "id, branch_id",
      shifts: "id, status",
      expenses: "id, created_at",
      sales: "id, client_txn_id, sync_status, local_created_at",
      held_orders: "id, created_at",
      sync_queue: "id, status, next_attempt_at, entity",
      meta: "key",
    });
    this.version(2).stores({
      purchase_orders: "id, order_no, supplier_id, warehouse_id, status, created_at",
      purchase_order_items: "id, purchase_order_id, product_id",
    });
  }
}

let _db: PosDatabase | undefined;

/** Dexie is browser-only; never construct it during SSR. */
export function db(): PosDatabase {
  if (typeof indexedDB === "undefined") {
    throw new Error("local database unavailable outside the browser");
  }
  if (!_db) _db = new PosDatabase();
  return _db;
}

export function hasLocalDb(): boolean {
  return typeof indexedDB !== "undefined";
}

export async function deviceId(): Promise<string> {
  const key = "device_id";
  const existing = await getMeta<string>(key);
  if (existing) return existing;
  const id = crypto.randomUUID();
  await setMeta(key, id);
  return id;
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const row = await db().meta.get(key);
  return row?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db().meta.put({ key, value });
}
