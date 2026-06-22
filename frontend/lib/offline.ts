// ═══════════════════════════════════════════════════════════════════
//  Offline outbox — the client half of offline-first.
//
//  When the till is offline (or a checkout fails on the network), the sale is
//  queued locally with a CLIENT-generated idempotency key and replayed through
//  the backend's /sync/push when connectivity returns. The server replays each
//  op through the very same createSale path the online till uses, so we inherit
//  exactly-once semantics and conflict detection for free: a re-pushed op comes
//  back "duplicate", a key reused with a different cart comes back "conflict".
//
//  The sync logic is decoupled from storage (an OutboxStore) so it runs in the
//  browser on IndexedDB and in Node/SSR on an in-memory store — and so the replay
//  protocol can be verified against a live backend without a browser.
// ═══════════════════════════════════════════════════════════════════

export interface OutboxOp {
  op_id: string;
  type: 'sale';
  idempotency_key: string;
  payload: Record<string, any>;
  queued_at: number;
}

export interface PushResult {
  server_time: string;
  applied: number;
  total: number;
  results: { op_id: string; status: 'applied' | 'duplicate' | 'conflict' | 'error'; sale_id?: string; error?: string; code?: string }[];
}

export type PushFn = (body: { device_id: string; operations: OutboxOp[] }) => Promise<PushResult>;

export interface FlushSummary {
  pushed: number;
  applied: number;
  duplicate: number;
  conflict: number;
  error: number;
  remaining: number;
  failures: { op_id: string; status: string; error?: string }[];
}

// ── Storage ─────────────────────────────────────────────────────────
export interface OutboxStore {
  all(): Promise<OutboxOp[]>;
  add(op: OutboxOp): Promise<void>;
  remove(opId: string): Promise<void>;
}

const DB_NAME = 'balanzify-offline';
const STORE = 'outbox';

class IdbStore implements OutboxStore {
  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: 'op_id' }); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  private tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
    return db.transaction(STORE, mode).objectStore(STORE);
  }
  all(): Promise<OutboxOp[]> {
    return this.open().then((db) => new Promise<OutboxOp[]>((resolve, reject) => {
      const r = this.tx(db, 'readonly').getAll();
      r.onsuccess = () => resolve((r.result as OutboxOp[]).sort((a, b) => a.queued_at - b.queued_at));
      r.onerror = () => reject(r.error);
    }));
  }
  add(op: OutboxOp): Promise<void> {
    return this.open().then((db) => new Promise<void>((resolve, reject) => {
      const r = this.tx(db, 'readwrite').put(op);
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    }));
  }
  remove(opId: string): Promise<void> {
    return this.open().then((db) => new Promise<void>((resolve, reject) => {
      const r = this.tx(db, 'readwrite').delete(opId);
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    }));
  }
}

export class MemStore implements OutboxStore {
  private ops: OutboxOp[] = [];
  async all() { return [...this.ops].sort((a, b) => a.queued_at - b.queued_at); }
  async add(op: OutboxOp) { this.ops = this.ops.filter((o) => o.op_id !== op.op_id).concat(op); }
  async remove(opId: string) { this.ops = this.ops.filter((o) => o.op_id !== opId); }
}

export function makeStore(): OutboxStore {
  return typeof indexedDB !== 'undefined' ? new IdbStore() : new MemStore();
}

// ── Device identity ─────────────────────────────────────────────────
const DEVICE_KEY = 'bz_device_id';
export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'server';
  let id = window.localStorage.getItem(DEVICE_KEY);
  if (!id) { id = 'dev-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36); window.localStorage.setItem(DEVICE_KEY, id); }
  return id;
}

function randomId(): string {
  return (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ── Outbox ──────────────────────────────────────────────────────────
export class Outbox {
  constructor(private store: OutboxStore, private push: PushFn, private deviceId: string = getDeviceId()) {}

  /** Queue a sale for later replay. Returns the generated idempotency key. */
  async enqueueSale(payload: Record<string, any>, idempotencyKey?: string): Promise<string> {
    const key = idempotencyKey || `${this.deviceId}-${Date.now()}-${randomId()}`;
    await this.store.add({ op_id: randomId(), type: 'sale', idempotency_key: key, payload, queued_at: Date.now() });
    return key;
  }

  async pendingCount(): Promise<number> {
    return (await this.store.all()).length;
  }

  /**
   * Replay the whole outbox in one batch. Applied/duplicate ops are drained;
   * conflicts and errors are drained too (retrying won't fix a cart conflict or a
   * stock rejection) but reported as failures for the operator to resolve.
   */
  async flush(): Promise<FlushSummary> {
    const ops = await this.store.all();
    const summary: FlushSummary = { pushed: ops.length, applied: 0, duplicate: 0, conflict: 0, error: 0, remaining: 0, failures: [] };
    if (ops.length === 0) return summary;

    const res = await this.push({ device_id: this.deviceId, operations: ops });
    for (const r of res.results) {
      if (r.status === 'applied') summary.applied++;
      else if (r.status === 'duplicate') summary.duplicate++;
      else if (r.status === 'conflict') { summary.conflict++; summary.failures.push({ op_id: r.op_id, status: r.status, error: r.error }); }
      else { summary.error++; summary.failures.push({ op_id: r.op_id, status: r.status, error: r.error }); }
      // Drain every op the server acknowledged so the queue never wedges.
      await this.store.remove(r.op_id);
    }
    summary.remaining = await this.pendingCount();
    return summary;
  }
}
