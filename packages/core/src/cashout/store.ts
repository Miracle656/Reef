/**
 * SERVER-ONLY. Where cash-out orders are kept: one Postgres table, plain SQL.
 *
 * The store takes a `SqlQuery` function, not a driver, so the same SQL runs on
 * Neon's HTTP driver in production and on an in-process Postgres in tests.
 * The table is also declared in `services/indexer/prisma/schema.prisma`
 * (`CashoutOrder`) so `prisma db push` keeps it; the DDL below is the SQL
 * Prisma generates for that model, made idempotent.
 */
import type { CashoutCoin, CashoutStatus } from "./index";

/** Run one parameterised statement (`$1`, `$2`, …) and return its rows. */
export type SqlQuery = (text: string, params: unknown[]) => Promise<Record<string, unknown>[]>;

export interface CashoutOrderRow {
  /** chosen by the client (uuid); also Linq's idempotency key */
  id: string;
  owner: string;
  network: string;
  linqOrderId: string;
  coin: CashoutCoin;
  coinType: string;
  depositAddress: string;
  /** dollars to send, in the coin's base units */
  amountStable: bigint;
  /** naira to be paid out, e.g. "82750.00" */
  amountNgn: string;
  /** naira per dollar, locked when the order was made */
  rate: string;
  bankCode: string;
  bankName: string;
  accountName: string;
  accountNumberMasked: string;
  status: CashoutStatus;
  /** Linq's own status text, as last seen */
  linqStatus: string;
  depositDigest: string | null;
  depositAtMs: number | null;
  settledStable: bigint | null;
  settledNgn: string | null;
  createdAtMs: number;
  expiresAtMs: number;
  updatedAtMs: number;
  /** when the status was last checked with Linq */
  refreshedAtMs: number;
}

export type CashoutOrderPatch = Partial<
  Pick<
    CashoutOrderRow,
    "status" | "linqStatus" | "depositDigest" | "depositAtMs" | "settledStable" | "settledNgn" | "updatedAtMs" | "refreshedAtMs"
  >
>;

export interface CashoutStore {
  /** Create the table if it isn't there. Safe to call on every cold start. */
  init(): Promise<void>;
  /** Insert unless an order with this id (or Linq id) already exists. Returns whether it inserted. */
  insert(row: CashoutOrderRow): Promise<boolean>;
  get(id: string): Promise<CashoutOrderRow | null>;
  getByLinqId(linqOrderId: string): Promise<CashoutOrderRow | null>;
  /** newest first */
  listByOwner(owner: string, limit: number): Promise<CashoutOrderRow[]>;
  /** how many orders `owner` created at or after `sinceMs` */
  countSince(owner: string, sinceMs: number): Promise<number>;
  update(id: string, patch: CashoutOrderPatch): Promise<void>;
}

const TABLE = '"CashoutOrder"';

const COLUMNS = [
  "id",
  "owner",
  "network",
  "linqOrderId",
  "coin",
  "coinType",
  "depositAddress",
  "amountStable",
  "amountNgn",
  "rate",
  "bankCode",
  "bankName",
  "accountName",
  "accountNumberMasked",
  "status",
  "linqStatus",
  "depositDigest",
  "depositAtMs",
  "settledStable",
  "settledNgn",
  "createdAtMs",
  "expiresAtMs",
  "updatedAtMs",
  "refreshedAtMs",
] as const satisfies readonly (keyof CashoutOrderRow)[];

const SELECT = `SELECT ${COLUMNS.map((c) => `"${c}"`).join(", ")} FROM ${TABLE}`;

/** The DDL `prisma migrate diff` prints for the `CashoutOrder` model, with IF NOT EXISTS. */
export const CASHOUT_DDL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS ${TABLE} (
    "id" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "linqOrderId" TEXT NOT NULL,
    "coin" TEXT NOT NULL,
    "coinType" TEXT NOT NULL,
    "depositAddress" TEXT NOT NULL,
    "amountStable" BIGINT NOT NULL,
    "amountNgn" TEXT NOT NULL,
    "rate" TEXT NOT NULL,
    "bankCode" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountNumberMasked" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "linqStatus" TEXT NOT NULL,
    "depositDigest" TEXT,
    "depositAtMs" BIGINT,
    "settledStable" BIGINT,
    "settledNgn" TEXT,
    "createdAtMs" BIGINT NOT NULL,
    "expiresAtMs" BIGINT NOT NULL,
    "updatedAtMs" BIGINT NOT NULL,
    "refreshedAtMs" BIGINT NOT NULL,
    CONSTRAINT "CashoutOrder_pkey" PRIMARY KEY ("id")
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CashoutOrder_linqOrderId_key" ON ${TABLE}("linqOrderId")`,
  `CREATE INDEX IF NOT EXISTS "CashoutOrder_owner_createdAtMs_idx" ON ${TABLE}("owner", "createdAtMs")`,
];

// BIGINT travels as text in both directions: JSON (Neon's HTTP driver) has no
// 64-bit integer, and drivers disagree on whether int8 comes back as a string,
// a number or a bigint.
const toDb = (v: unknown): unknown => (typeof v === "bigint" || typeof v === "number" ? v.toString() : v);
const big = (v: unknown): bigint => BigInt(String(v));
const bigOrNull = (v: unknown): bigint | null => (v == null ? null : big(v));
const num = (v: unknown): number => Number(String(v));
const numOrNull = (v: unknown): number | null => (v == null ? null : num(v));
const strOrNull = (v: unknown): string | null => (v == null ? null : String(v));

function fromDb(r: Record<string, unknown>): CashoutOrderRow {
  return {
    id: String(r.id),
    owner: String(r.owner),
    network: String(r.network),
    linqOrderId: String(r.linqOrderId),
    coin: String(r.coin) as CashoutCoin,
    coinType: String(r.coinType),
    depositAddress: String(r.depositAddress),
    amountStable: big(r.amountStable),
    amountNgn: String(r.amountNgn),
    rate: String(r.rate),
    bankCode: String(r.bankCode),
    bankName: String(r.bankName),
    accountName: String(r.accountName),
    accountNumberMasked: String(r.accountNumberMasked),
    status: String(r.status) as CashoutStatus,
    linqStatus: String(r.linqStatus),
    depositDigest: strOrNull(r.depositDigest),
    depositAtMs: numOrNull(r.depositAtMs),
    settledStable: bigOrNull(r.settledStable),
    settledNgn: strOrNull(r.settledNgn),
    createdAtMs: num(r.createdAtMs),
    expiresAtMs: num(r.expiresAtMs),
    updatedAtMs: num(r.updatedAtMs),
    refreshedAtMs: num(r.refreshedAtMs),
  };
}

const PATCHABLE = new Set<string>([
  "status",
  "linqStatus",
  "depositDigest",
  "depositAtMs",
  "settledStable",
  "settledNgn",
  "updatedAtMs",
  "refreshedAtMs",
] satisfies (keyof CashoutOrderPatch)[]);

export function createSqlCashoutStore(query: SqlQuery): CashoutStore {
  let ready: Promise<void> | null = null;
  return {
    init() {
      // One attempt at a time; a failed attempt can be retried on the next call.
      ready ??= (async () => {
        for (const statement of CASHOUT_DDL) await query(statement, []);
      })().catch((e) => {
        ready = null;
        throw e;
      });
      return ready;
    },

    async insert(row) {
      const placeholders = COLUMNS.map((_, i) => `$${i + 1}`).join(", ");
      const rows = await query(
        `INSERT INTO ${TABLE} (${COLUMNS.map((c) => `"${c}"`).join(", ")}) VALUES (${placeholders}) ON CONFLICT DO NOTHING RETURNING "id"`,
        COLUMNS.map((c) => toDb(row[c])),
      );
      return rows.length === 1;
    },

    async get(id) {
      const rows = await query(`${SELECT} WHERE "id" = $1`, [id]);
      return rows[0] ? fromDb(rows[0]) : null;
    },

    async getByLinqId(linqOrderId) {
      const rows = await query(`${SELECT} WHERE "linqOrderId" = $1`, [linqOrderId]);
      return rows[0] ? fromDb(rows[0]) : null;
    },

    async listByOwner(owner, limit) {
      const rows = await query(`${SELECT} WHERE "owner" = $1 ORDER BY "createdAtMs" DESC LIMIT $2`, [owner, String(limit)]);
      return rows.map(fromDb);
    },

    async countSince(owner, sinceMs) {
      const rows = await query(`SELECT COUNT(*) AS "n" FROM ${TABLE} WHERE "owner" = $1 AND "createdAtMs" >= $2`, [owner, String(sinceMs)]);
      return num(rows[0]?.n ?? 0);
    },

    async update(id, patch) {
      const entries = Object.entries(patch).filter(([k, v]) => PATCHABLE.has(k) && v !== undefined);
      if (entries.length === 0) return;
      const sets = entries.map(([k], i) => `"${k}" = $${i + 2}`).join(", ");
      await query(`UPDATE ${TABLE} SET ${sets} WHERE "id" = $1`, [id, ...entries.map(([, v]) => toDb(v))]);
    },
  };
}

/** In-memory store with the same behaviour, for tests and local rehearsal. */
export function createMemoryCashoutStore(): CashoutStore {
  const rows = new Map<string, CashoutOrderRow>();
  return {
    async init() {},
    async insert(row) {
      if (rows.has(row.id) || [...rows.values()].some((r) => r.linqOrderId === row.linqOrderId)) return false;
      rows.set(row.id, { ...row });
      return true;
    },
    async get(id) {
      const r = rows.get(id);
      return r ? { ...r } : null;
    },
    async getByLinqId(linqOrderId) {
      const r = [...rows.values()].find((x) => x.linqOrderId === linqOrderId);
      return r ? { ...r } : null;
    },
    async listByOwner(owner, limit) {
      return [...rows.values()]
        .filter((r) => r.owner === owner)
        .sort((a, b) => b.createdAtMs - a.createdAtMs)
        .slice(0, limit)
        .map((r) => ({ ...r }));
    },
    async countSince(owner, sinceMs) {
      return [...rows.values()].filter((r) => r.owner === owner && r.createdAtMs >= sinceMs).length;
    },
    async update(id, patch) {
      const r = rows.get(id);
      if (!r) return;
      for (const [k, v] of Object.entries(patch)) {
        if (PATCHABLE.has(k) && v !== undefined) (r as unknown as Record<string, unknown>)[k] = v;
      }
    },
  };
}
