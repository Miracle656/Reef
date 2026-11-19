import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { CASHOUT_DDL, createMemoryCashoutStore, createSqlCashoutStore, type CashoutOrderRow, type CashoutStore, type SqlQuery } from "../server";

const OWNER = "0x" + "a".repeat(64);
const OTHER = "0x" + "b".repeat(64);

let n = 0;
function row(over: Partial<CashoutOrderRow> = {}): CashoutOrderRow {
  n++;
  return {
    id: `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`,
    owner: OWNER,
    network: "mainnet",
    linqOrderId: `linq-${n}`,
    coin: "usdc",
    coinType: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
    depositAddress: "0x" + "d".repeat(64),
    amountStable: 10_000_000n,
    amountNgn: "15000.00",
    rate: "1500",
    bankCode: "033",
    bankName: "United Bank for Africa",
    accountName: "ADA O'BI \"Q\"; DROP TABLE", // hostile text must round-trip as data
    accountNumberMasked: "******7890",
    status: "awaiting_deposit",
    linqStatus: "initiated",
    depositDigest: null,
    depositAtMs: null,
    settledStable: null,
    settledNgn: null,
    createdAtMs: 1_800_000_000_000 + n,
    expiresAtMs: 1_800_000_600_000 + n,
    updatedAtMs: 1_800_000_000_000 + n,
    refreshedAtMs: 1_800_000_000_000 + n,
    ...over,
  };
}

/** The same behaviour is required of the real SQL store and the in-memory one. */
function suite(name: string, make: () => Promise<CashoutStore>) {
  describe(name, () => {
    let store: CashoutStore;
    beforeAll(async () => {
      store = await make();
      await store.init();
    }, 60_000);

    it("can be initialised again without harm", async () => {
      await store.init();
      await store.init();
    });

    it("stores an order and reads back exactly what was stored", async () => {
      const r = row();
      expect(await store.insert(r)).toBe(true);
      expect(await store.get(r.id)).toEqual(r);
      expect(await store.getByLinqId(r.linqOrderId)).toEqual(r);
      expect(await store.get("00000000-0000-4000-8000-999999999999")).toBeNull();
      expect(await store.getByLinqId("nope")).toBeNull();
    });

    it("keeps 64-bit amounts exact (beyond what a JS number can hold)", async () => {
      const huge = 9_007_199_254_740_993n; // 2^53 + 1
      const r = row({ amountStable: huge, settledStable: huge + 2n, depositAtMs: 1_800_000_000_123, depositDigest: "9UaN13guxdbdKgTEe6KGLYMd2RPQQDETFEvx4PFrogL5", settledNgn: "1.00" });
      await store.insert(r);
      const back = await store.get(r.id);
      expect(back!.amountStable).toBe(huge);
      expect(back!.settledStable).toBe(huge + 2n);
      expect(back).toEqual(r);
    });

    it("refuses a second order with the same id or the same Linq id, leaving the first untouched", async () => {
      const r = row();
      await store.insert(r);
      expect(await store.insert({ ...r, linqOrderId: "linq-other", owner: OTHER })).toBe(false);
      expect(await store.insert({ ...row(), linqOrderId: r.linqOrderId, owner: OTHER })).toBe(false);
      expect(await store.get(r.id)).toEqual(r);
    });

    it("lists an owner's orders newest first, up to the limit", async () => {
      const owner = "0x" + "c".repeat(64);
      const made = [row({ owner, createdAtMs: 100 }), row({ owner, createdAtMs: 300 }), row({ owner, createdAtMs: 200 })];
      for (const r of made) await store.insert(r);
      await store.insert(row({ owner: OTHER, createdAtMs: 250 }));
      expect((await store.listByOwner(owner, 10)).map((r) => r.createdAtMs)).toEqual([300, 200, 100]);
      expect((await store.listByOwner(owner, 2)).map((r) => r.createdAtMs)).toEqual([300, 200]);
      expect(await store.listByOwner("0x" + "e".repeat(64), 10)).toEqual([]);
    });

    it("counts an owner's orders at or after a time", async () => {
      const owner = "0x" + "f".repeat(64);
      for (const createdAtMs of [1000, 2000, 3000]) await store.insert(row({ owner, createdAtMs }));
      expect(await store.countSince(owner, 0)).toBe(3);
      expect(await store.countSince(owner, 2000)).toBe(2);
      expect(await store.countSince(owner, 3001)).toBe(0);
      expect(await store.countSince("0x" + "9".repeat(64), 0)).toBe(0);
    });

    it("updates only the fields a status change may touch", async () => {
      const r = row();
      await store.insert(r);
      await store.update(r.id, {
        status: "paid",
        linqStatus: "Settled in treasury",
        depositDigest: "2rsyGcKhTVEybYgZPvykPoCxfieh9zP21LCWkWhWdgMn",
        depositAtMs: 1_800_000_000_999,
        settledStable: 9_500_000n,
        settledNgn: "14250.00",
        updatedAtMs: 1_800_000_001_000,
        refreshedAtMs: 1_800_000_001_001,
        // not patchable: must be ignored, never written
        ...({ owner: OTHER, amountStable: 1n, depositAddress: "0x" + "e".repeat(64), "status\" = 'x'; --": "y" } as object),
      });
      expect(await store.get(r.id)).toEqual({
        ...r,
        status: "paid",
        linqStatus: "Settled in treasury",
        depositDigest: "2rsyGcKhTVEybYgZPvykPoCxfieh9zP21LCWkWhWdgMn",
        depositAtMs: 1_800_000_000_999,
        settledStable: 9_500_000n,
        settledNgn: "14250.00",
        updatedAtMs: 1_800_000_001_000,
        refreshedAtMs: 1_800_000_001_001,
      });
      // an empty patch and an unknown id are no-ops
      await store.update(r.id, {});
      await store.update("00000000-0000-4000-8000-999999999999", { status: "failed" });
    });
  });
}

let db: PGlite;
const pgQuery: SqlQuery = async (text, params) => (await db.query(text, params)).rows as Record<string, unknown>[];

suite("SQL store on real Postgres (PGlite)", async () => {
  db = new PGlite();
  return createSqlCashoutStore(pgQuery);
});

suite("in-memory store", async () => createMemoryCashoutStore());

describe("the table definition", () => {
  it("creates exactly the columns and indexes the Prisma model declares", async () => {
    const fresh = new PGlite();
    for (const statement of CASHOUT_DDL) await fresh.query(statement);
    const cols = await fresh.query<{ column_name: string; data_type: string; is_nullable: string }>(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'CashoutOrder' ORDER BY ordinal_position`,
    );
    expect(cols.rows.map((c) => `${c.column_name} ${c.data_type} ${c.is_nullable === "YES" ? "NULL" : "NOT NULL"}`)).toEqual([
      "id text NOT NULL",
      "owner text NOT NULL",
      "network text NOT NULL",
      "linqOrderId text NOT NULL",
      "coin text NOT NULL",
      "coinType text NOT NULL",
      "depositAddress text NOT NULL",
      "amountStable bigint NOT NULL",
      "amountNgn text NOT NULL",
      "rate text NOT NULL",
      "bankCode text NOT NULL",
      "bankName text NOT NULL",
      "accountName text NOT NULL",
      "accountNumberMasked text NOT NULL",
      "status text NOT NULL",
      "linqStatus text NOT NULL",
      "depositDigest text NULL",
      "depositAtMs bigint NULL",
      "settledStable bigint NULL",
      "settledNgn text NULL",
      "createdAtMs bigint NOT NULL",
      "expiresAtMs bigint NOT NULL",
      "updatedAtMs bigint NOT NULL",
      "refreshedAtMs bigint NOT NULL",
    ]);
    const idx = await fresh.query<{ indexname: string }>(`SELECT indexname FROM pg_indexes WHERE tablename = 'CashoutOrder' ORDER BY indexname`);
    // the names Prisma generates, so `prisma db push` sees nothing to change
    expect(idx.rows.map((r) => r.indexname)).toEqual(["CashoutOrder_linqOrderId_key", "CashoutOrder_owner_createdAtMs_idx", "CashoutOrder_pkey"]);
  }, 60_000);
});
