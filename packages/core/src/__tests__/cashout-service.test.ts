import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { cashout } from "../index";
import {
  CashoutError,
  createCashoutService,
  createMemoryCashoutStore,
  LinqError,
  type CashoutService,
  type CashoutStore,
  type LinqClient,
  type LinqOfframpOrder,
  type LinqOfframpRequest,
} from "../server";

const OWNER = "0x" + "a".repeat(64);
const OTHER = "0x" + "b".repeat(64);
const DEPOSIT = "0x" + "d".repeat(64);
const USDC = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";
const USDSUI = "0x44f838219cf67b058f3b37907b655f226153c18e33dfcd0da559a844fea9b1c1::usdsui::USDSUI";
const RATE = 1500;
const WEBHOOK_SECRET = "whsec_test";
const DIGEST = "9UaN13guxdbdKgTEe6KGLYMd2RPQQDETFEvx4PFrogL5";

let clock: number;
let store: CashoutStore;
let service: CashoutService;
let logs: string[];
/** what the fake Linq was asked, and switches to make it misbehave */
let linqCalls: { verifyBank: number; create: LinqOfframpRequest[]; status: number; rate: number };
let linqStatus: string | Error;
let tamper: (o: LinqOfframpOrder) => LinqOfframpOrder;
let createError: Error | null;
let bankError: Error | null;
let rateError: Error | null;
let seq = 0;

const uuid = () => `00000000-0000-4000-8000-${(++seq).toString().padStart(12, "0")}`;

function fakeLinq(): LinqClient {
  return {
    async getRate() {
      linqCalls.rate++;
      if (rateError) throw rateError;
      return { rate: RATE, currency: "NGN", coin: "USDSUI" };
    },
    async verifyBank({ bankCode, accountNumber }) {
      linqCalls.verifyBank++;
      if (bankError) throw bankError;
      return { accountName: "ADA OBI", bankName: `Bank ${bankCode}`, accountNumber, bankCode };
    },
    async createOfframp(input) {
      linqCalls.create.push(input);
      if (createError) throw createError;
      const cents = input.amountNGN !== undefined ? cashout.centsForNgn(cashout.toHundredths(input.amountNGN.toFixed(2)), RATE) : cashout.toHundredths(input.amountStableCoin!.toFixed(2));
      const kobo = input.amountNGN !== undefined ? cashout.toHundredths(input.amountNGN.toFixed(2)) : cashout.koboForCents(cents, RATE);
      return tamper({
        id: `linq-${input.idempotencyKey}`,
        walletAddress: DEPOSIT,
        coinType: input.coin === "usdc" ? USDC : USDSUI,
        coin: input.coin,
        chain: "sui",
        amountStableCoin: Number(cents) / 100,
        amountNGN: Number(kobo) / 100,
        rate: RATE,
        status: "initiated",
      });
    },
    async getStatus(id) {
      linqCalls.status++;
      if (linqStatus instanceof Error) throw linqStatus;
      return { id, status: linqStatus, amountStableCoin: 10, amountNGN: 15000 };
    },
  };
}

/** The fake wallet: a signature is valid iff it is "sig:<owner>" over the canonical bytes. */
const verified: string[] = [];
async function verifyOwner(owner: string, bytes: Uint8Array, signature: string): Promise<boolean> {
  verified.push(new TextDecoder().decode(bytes));
  return signature === `sig:${owner}`;
}

const signed = (message: cashout.CashoutMessage, signer = message.owner) => ({ message, signature: `sig:${signer}` });

function createMsg(over: Partial<Extract<cashout.CashoutMessage, { action: "create" }>> = {}): Extract<cashout.CashoutMessage, { action: "create" }> {
  return { action: "create", owner: OWNER, orderId: uuid(), coin: "usdc", amountKind: "stable", amount: "10", bankCode: "033", accountNumber: "1234567890", timestamp: clock, ...over };
}

async function makeOrder(over: Parameters<typeof createMsg>[0] = {}): Promise<cashout.CashoutOrderView> {
  const res = await service.handle(signed(createMsg(over)));
  if (res.action !== "create") throw new Error("unexpected");
  return res.order;
}

const getOrder = async (orderId: string, owner = OWNER) => {
  const res = await service.handle(signed({ action: "get", owner, orderId, timestamp: clock }));
  if (res.action !== "get") throw new Error("unexpected");
  return res.order;
};

const rejects = async (p: Promise<unknown>, code: string, status: number) => {
  const err = await p.then(
    () => null,
    (e) => e,
  );
  expect(err, `expected ${code}`).toBeInstanceOf(CashoutError);
  expect(err).toMatchObject({ code, status });
  return err as CashoutError;
};

const webhookBody = (event: string, orderId: string, extra: Record<string, unknown> = {}) => {
  const body = JSON.stringify({ event, orderId, ...extra });
  return { body, signature: "sha256=" + createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex") };
};

beforeEach(() => {
  clock = 1_800_000_000_000;
  store = createMemoryCashoutStore();
  logs = [];
  linqCalls = { verifyBank: 0, create: [], status: 0, rate: 0 };
  linqStatus = "initiated";
  tamper = (o) => o;
  createError = bankError = rateError = null;
  verified.length = 0;
  service = createCashoutService({
    store,
    linq: fakeLinq(),
    verifyOwner,
    now: () => clock,
    log: (m) => logs.push(m),
    config: { network: "mainnet", coins: { usdc: { type: USDC, decimals: 6 }, usdsui: { type: USDSUI, decimals: 6 } }, webhookSecret: WEBHOOK_SECRET },
  });
});

describe("who may call", () => {
  it("rejects a malformed body before doing anything", async () => {
    for (const body of [null, {}, { message: { action: "list" } }, { message: createMsg(), signature: "" }, "nope"]) {
      await rejects(service.handle(body), "bad_request", 400);
    }
    expect(verified).toHaveLength(0);
  });

  it("verifies the signature over the canonical bytes of exactly this request", async () => {
    const m = createMsg();
    await service.handle(signed(m));
    expect(verified).toEqual([new TextDecoder().decode(cashout.canonicalCashoutBytes(m))]);
  });

  it("rejects a signature from another wallet, and creates nothing", async () => {
    await rejects(service.handle(signed(createMsg(), OTHER)), "unauthorized", 401);
    expect(linqCalls.create).toHaveLength(0);
    expect(await store.countSince(OWNER, 0)).toBe(0);
  });

  it("rejects a request whose timestamp is more than 5 minutes off, either way", async () => {
    await rejects(service.handle(signed(createMsg({ timestamp: clock - 5 * 60_000 - 1 }))), "unauthorized", 401);
    await rejects(service.handle(signed(createMsg({ timestamp: clock + 5 * 60_000 + 1 }))), "unauthorized", 401);
    // right at the edge is still fine
    expect((await service.handle(signed(createMsg({ timestamp: clock - 5 * 60_000 })))).action).toBe("create");
    expect(linqCalls.create).toHaveLength(1);
  });

  it("treats a verifier that throws as an invalid signature", async () => {
    const s = createCashoutService({ store, linq: fakeLinq(), verifyOwner: async () => Promise.reject(new Error("rpc down")), now: () => clock, config: { network: "mainnet", coins: {} } });
    await rejects(s.handle(signed(createMsg())), "unauthorized", 401);
  });
});

describe("a session: one signature for many requests", () => {
  /** What the wallet signs once. The fake wallet's signature is "sig:<signer>". */
  const session = (owner = OWNER, issuedAt = clock, signer = owner) => ({ issuedAt, signature: `sig:${signer}` });
  const sessionText = (owner: string, issuedAt: number) => new TextDecoder().decode(cashout.canonicalCashoutSessionBytes("mainnet", owner, issuedAt));

  it("lets one signature carry a whole cash-out", async () => {
    const mine = session();
    const bank = await service.handle({ message: { action: "verify-bank", owner: OWNER, bankCode: "033", accountNumber: "1234567890", timestamp: clock }, session: mine });
    expect(bank.action).toBe("verify-bank");

    const made = await service.handle({ message: createMsg(), session: mine });
    if (made.action !== "create") throw new Error("unexpected");
    const id = made.order.id;

    clock += 60_000;
    expect((await service.handle({ message: { action: "deposit", owner: OWNER, orderId: id, digest: DIGEST, timestamp: clock }, session: mine })).action).toBe("deposit");
    clock += 60_000;
    expect((await service.handle({ message: { action: "get", owner: OWNER, orderId: id, timestamp: clock }, session: mine })).action).toBe("get");
    const listed = await service.handle({ message: { action: "list", owner: OWNER, timestamp: clock }, session: mine });
    expect(listed.action === "list" && listed.orders.map((o) => o.id)).toEqual([id]);

    // The wallet was asked about once, and about the session, not about each request.
    expect(verified).toEqual([sessionText(OWNER, mine.issuedAt)]);
  });

  it("signs the network, the wallet and the time, and nothing else", () => {
    expect(sessionText(OWNER, 1_800_000_000_000)).toBe(`reef:cashout:session:mainnet:${OWNER}:1800000000000`);
    // never the same bytes as a request, whatever the request
    const request = new TextDecoder().decode(cashout.canonicalCashoutBytes({ action: "list", owner: OWNER, timestamp: 1_800_000_000_000 }));
    expect(request).not.toBe(sessionText(OWNER, 1_800_000_000_000));
    expect(request.startsWith("reef:cashout:list:")).toBe(true);
  });

  it("only opens the wallet that signed it", async () => {
    const mine = session(OWNER);
    const order = await makeOrder();
    // my session can't act as someone else
    await rejects(service.handle({ message: createMsg({ owner: OTHER }), session: mine }), "unauthorized", 401);
    // someone else's session can't act as me, or read my order
    const theirs = session(OTHER);
    await rejects(service.handle({ message: createMsg({ owner: OWNER }), session: theirs }), "unauthorized", 401);
    await rejects(service.handle({ message: { action: "get", owner: OTHER, orderId: order.id, timestamp: clock }, session: theirs }), "not_found", 404);
    // a session claimed for me but signed by another wallet
    await rejects(service.handle({ message: { action: "list", owner: OWNER, timestamp: clock }, session: session(OWNER, clock, OTHER) }), "unauthorized", 401);
    expect(linqCalls.create).toHaveLength(1);
  });

  it("runs out after 30 minutes, and can't be dated ahead to last longer", async () => {
    const mine = session();
    const list = () => service.handle({ message: { action: "list", owner: OWNER, timestamp: clock }, session: mine });
    await list();
    clock += cashout.CASHOUT_SESSION_MS;
    await list(); // exactly at the limit still counts
    clock += 1;
    const err = await rejects(list(), "unauthorized", 401);
    expect(err.message).toContain("Confirm it's you again");

    // a session dated in the future is refused before any signature is checked
    verified.length = 0;
    const ahead = session(OWNER, clock + 6 * 60_000);
    await rejects(service.handle({ message: { action: "list", owner: OWNER, timestamp: clock }, session: ahead }), "unauthorized", 401);
    expect(verified).toHaveLength(0);
    // a clock a little ahead is tolerated
    await service.handle({ message: { action: "list", owner: OWNER, timestamp: clock }, session: session(OWNER, clock + 60_000) });
  });

  it("still needs every request to be fresh", async () => {
    const mine = session();
    await rejects(service.handle({ message: { action: "list", owner: OWNER, timestamp: clock - 6 * 60_000 }, session: mine }), "unauthorized", 401);
  });

  it("remembers a verified session, but never lets a different claim ride on it", async () => {
    const mine = session();
    const list = (s: { issuedAt: number; signature: string }, owner = OWNER) =>
      service.handle({ message: { action: "list", owner, timestamp: clock }, session: s });
    await list(mine);
    await list(mine);
    expect(verified).toHaveLength(1);

    // same wallet and time, a different signature: checked, and refused
    await rejects(list({ issuedAt: mine.issuedAt, signature: "sig:forged" }), "unauthorized", 401);
    // same signature, another time: checked again (the fake wallet accepts it, a real one signs the time)
    await list({ issuedAt: mine.issuedAt + 1, signature: mine.signature });
    // same time and signature, claimed for another wallet: checked, and refused
    await rejects(list(mine, OTHER), "unauthorized", 401);
    expect(verified).toHaveLength(4);
  });

  it("never remembers a session that failed, and survives the wallet check erroring", async () => {
    const flaky = createCashoutService({
      store,
      linq: fakeLinq(),
      verifyOwner: async () => {
        throw new Error("node unreachable");
      },
      now: () => clock,
      log: (m) => logs.push(m),
      config: { network: "mainnet", coins: { usdc: { type: USDC, decimals: 6 } } },
    });
    const body = { message: { action: "list", owner: OWNER, timestamp: clock }, session: session() };
    await rejects(flaky.handle(body), "unauthorized", 401);
    await rejects(flaky.handle(body), "unauthorized", 401);
    expect(logs.filter((l) => l.includes("signature check errored"))).toHaveLength(2);
  });

  it("honours a shorter session when configured, and the wallet allowlist", async () => {
    const strict = createCashoutService({
      store,
      linq: fakeLinq(),
      verifyOwner,
      now: () => clock,
      config: { network: "testnet", coins: { usdc: { type: USDC, decimals: 6 } }, sessionMs: 60_000, allowedOwners: new Set([OWNER]) },
    });
    const mine = session();
    const list = (owner = OWNER, s = mine) => strict.handle({ message: { action: "list", owner, timestamp: clock }, session: s });
    await list();
    // the session is tied to the network it was signed for
    expect(verified.at(-1)).toBe(`reef:cashout:session:testnet:${OWNER}:${mine.issuedAt}`);
    await rejects(list(OTHER, session(OTHER)), "unavailable", 503);
    clock += 60_001;
    await rejects(list(), "unauthorized", 401);
  });

  it("takes a request's own signature as before, and prefers it when both are sent", async () => {
    const m = createMsg();
    await service.handle({ ...signed(m), session: session(OWNER, clock, OTHER) });
    expect(verified).toEqual([new TextDecoder().decode(cashout.canonicalCashoutBytes(m))]);
    // a session signature is not a request signature, and the other way round
    for (const body of [{ message: createMsg(), session: { issuedAt: clock } }, { message: createMsg(), session: { signature: "sig" } }, { message: createMsg(), session: "sig" }]) {
      await rejects(service.handle(body), "bad_request", 400);
    }
  });
});

describe("verify-bank", () => {
  const lookup = (accountNumber = "1234567890") => service.handle(signed({ action: "verify-bank", owner: OWNER, bankCode: "033", accountNumber, timestamp: clock }));

  it("returns the name the bank holds", async () => {
    expect(await lookup()).toEqual({ action: "verify-bank", account: { bankCode: "033", bankName: "Bank 033", accountName: "ADA OBI" } });
  });

  it("says the account wasn't found when Linq refuses it, and that it's our side when Linq is down", async () => {
    bankError = new LinqError(400, "could not resolve account");
    expect((await rejects(lookup(), "bad_request", 400)).message).toMatch(/couldn't find that account/);
    bankError = new LinqError(503, "upstream");
    await rejects(lookup(), "provider", 502);
    // a rejected API key is our problem, not a wrong account number
    bankError = new LinqError(401, "invalid api key");
    await rejects(lookup(), "provider", 502);
  });

  it("limits lookups to 10 a minute per wallet", async () => {
    for (let i = 0; i < 10; i++) await lookup();
    await rejects(lookup(), "throttled", 429);
    expect(linqCalls.verifyBank).toBe(10);
    clock += 60_001;
    expect((await lookup()).action).toBe("verify-bank");
  });
});

describe("creating an order", () => {
  it("creates a dollar-amount order and returns where to send the money", async () => {
    const m = createMsg({ amount: "10" });
    const order = await makeOrder(m);
    expect(order).toMatchObject({
      id: m.orderId,
      status: "awaiting_deposit",
      coin: "usdc",
      coinType: USDC,
      depositAddress: DEPOSIT,
      amountStable: "10000000",
      amountNgn: "15000.00",
      rate: "1500",
      bankName: "Bank 033",
      accountName: "ADA OBI",
      accountNumberMasked: "******7890",
      depositDigest: null,
      createdAtMs: clock,
      expiresAtMs: clock + 10 * 60_000,
    });
    // the full account number is never in what we return or store
    expect(JSON.stringify(order)).not.toContain("1234567890");
    expect(JSON.stringify(await store.get(m.orderId), (_k, v) => (typeof v === "bigint" ? v.toString() : v))).not.toContain("1234567890");
  });

  it("asks Linq with the looked-up name, a refund address and the order id as idempotency key", async () => {
    const m = createMsg({ amountKind: "ngn", amount: "2000", coin: "usdsui" });
    const order = await makeOrder(m);
    expect(linqCalls.create).toEqual([
      {
        amountNGN: 2000,
        coin: "usdsui",
        bankAccount: "1234567890",
        bankCode: "033",
        bankName: "Bank 033",
        accountName: "ADA OBI",
        refundAddress: OWNER,
        customerRef: OWNER,
        idempotencyKey: m.orderId,
      },
    ]);
    // 2000 / 1500 rounded up to the cent
    expect(order).toMatchObject({ amountStable: "1340000", amountNgn: "2000.00", coinType: USDSUI });
  });

  it("returns the same order for a repeated request, without a second Linq order", async () => {
    const m = createMsg();
    const first = await service.handle(signed(m));
    clock += 30_000;
    const again = await service.handle(signed({ ...m, timestamp: clock }));
    expect(again).toEqual(first);
    expect(linqCalls.create).toHaveLength(1);
  });

  it("won't reveal or reuse someone else's order id", async () => {
    const m = createMsg();
    await service.handle(signed(m));
    await rejects(service.handle(signed({ ...m, owner: OTHER })), "not_found", 404);
    expect(linqCalls.create).toHaveLength(1);
  });

  it("enforces the $1 minimum and $500 maximum before spending a Linq order", async () => {
    expect((await rejects(service.handle(signed(createMsg({ amount: "0.99" }))), "limit", 400)).message).toMatch(/smallest cash-out is \$1\.00/);
    expect((await rejects(service.handle(signed(createMsg({ amount: "500.01" }))), "limit", 400)).message).toMatch(/at once is \$500\.00/);
    // naira amounts are held to the same limits at today's rate: 1,400 naira < $1, 750,001 naira > $500
    await rejects(service.handle(signed(createMsg({ amountKind: "ngn", amount: "1400" }))), "limit", 400);
    await rejects(service.handle(signed(createMsg({ amountKind: "ngn", amount: "750001" }))), "limit", 400);
    expect(linqCalls.create).toHaveLength(0);
    expect((await makeOrder({ amount: "1" })).amountStable).toBe("1000000");
    expect((await makeOrder({ amount: "500" })).amountStable).toBe("500000000");
  });

  it("allows 3 orders per 10 minutes per wallet, counted per wallet", async () => {
    for (let i = 0; i < 3; i++) await makeOrder();
    await rejects(service.handle(signed(createMsg())), "throttled", 429);
    expect(linqCalls.create).toHaveLength(3);
    // another wallet is unaffected
    expect((await makeOrder({ owner: OTHER })).status).toBe("awaiting_deposit");
    clock += 10 * 60_000 + 1;
    expect((await makeOrder()).status).toBe("awaiting_deposit");
  });

  it("allows 20 orders a day per wallet", async () => {
    for (let i = 0; i < 20; i++) {
      await makeOrder();
      clock += 4 * 60_000; // stay under the 10-minute limit
    }
    expect((await rejects(service.handle(signed(createMsg())), "throttled", 429)).message).toMatch(/today/);
  });

  it("refuses a coin this deployment doesn't cash out", async () => {
    const s = createCashoutService({ store, linq: fakeLinq(), verifyOwner, now: () => clock, config: { network: "testnet", coins: { usdc: { type: USDC, decimals: 6 } } } });
    await rejects(s.handle(signed(createMsg({ coin: "usdsui" }))), "bad_request", 400);
  });

  it("doesn't create anything when the account can't be found or Linq fails", async () => {
    bankError = new LinqError(400, "could not resolve account");
    await rejects(service.handle(signed(createMsg())), "bad_request", 400);
    bankError = null;
    createError = new LinqError(500, "boom");
    expect((await rejects(service.handle(signed(createMsg())), "provider", 502)).message).toMatch(/Nothing was sent/);
    createError = new LinqError(429, "slow down");
    await rejects(service.handle(signed(createMsg())), "unavailable", 503);
    expect(await store.countSince(OWNER, 0)).toBe(0);
  });

  it("needs today's rate to check a naira amount against the limits", async () => {
    rateError = new LinqError(0, "no answer");
    await rejects(service.handle(signed(createMsg({ amountKind: "ngn", amount: "2000" }))), "provider", 502);
    // a dollar amount doesn't need the rate
    expect((await makeOrder({ amount: "10" })).status).toBe("awaiting_deposit");
  });
});

describe("checking Linq's answer before trusting it", () => {
  const bad: [string, (o: LinqOfframpOrder) => LinqOfframpOrder][] = [
    ["another chain", (o) => ({ ...o, chain: "stellar" })],
    ["another coin", (o) => ({ ...o, coin: "usdsui" })],
    ["another coin type", (o) => ({ ...o, coinType: USDSUI })],
    ["something that isn't a coin type", (o) => ({ ...o, coinType: "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" })],
    ["a Stellar deposit address", (o) => ({ ...o, walletAddress: "GBQ7X2EXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMPLE" })],
    ["a short address", (o) => ({ ...o, walletAddress: "0x2" })],
    ["the user's own address as the deposit address", (o) => ({ ...o, walletAddress: OWNER })],
    ["far more dollars than were asked for", (o) => ({ ...o, amountStableCoin: 5000, amountNGN: 7_500_000 })],
    ["naira that don't match dollars x rate", (o) => ({ ...o, amountNGN: o.amountNGN * 2 })],
  ];
  for (const [what, change] of bad) {
    it(`refuses ${what}, stores nothing and tells the app nothing was started`, async () => {
      tamper = change;
      const m = createMsg();
      const err = await rejects(service.handle(signed(m)), "provider", 502);
      expect(err.message).toMatch(/nothing was started/);
      expect(await store.get(m.orderId)).toBeNull();
      expect(logs.some((l) => l.includes("REJECTED"))).toBe(true);
    });
  }

  it("accepts the same coin type written with a short package id, and an order with no chain field", async () => {
    tamper = (o) => ({ ...o, chain: undefined, coinType: USDC.replace("0x", "0x000").replace(/^0x000/, "0x") });
    expect((await makeOrder()).coinType).toBe(USDC);
  });

  it("tolerates Linq rounding the dollars up to the cent on a naira order", async () => {
    // 2000 naira -> 1.34 dollars; 1.34 x 1500 = 2010, ten naira over the 2000 asked for
    expect((await makeOrder({ amountKind: "ngn", amount: "2000" })).amountNgn).toBe("2000.00");
  });
});

describe("reading and following an order", () => {
  it("only the owner can read it; anyone else gets the same answer as for a missing order", async () => {
    const order = await makeOrder();
    await rejects(service.handle(signed({ action: "get", owner: OTHER, orderId: order.id, timestamp: clock })), "not_found", 404);
    await rejects(service.handle(signed({ action: "get", owner: OWNER, orderId: uuid(), timestamp: clock })), "not_found", 404);
    expect((await getOrder(order.id)).id).toBe(order.id);
  });

  it("follows Linq's status, asking at most once every few seconds", async () => {
    const order = await makeOrder();
    await getOrder(order.id); // asked a moment ago (at creation): no call
    expect(linqCalls.status).toBe(0);
    clock += 4_000;
    linqStatus = "processing: in bank queue";
    expect((await getOrder(order.id)).status).toBe("processing");
    expect(linqCalls.status).toBe(1);
    await getOrder(order.id);
    expect(linqCalls.status).toBe(1);
    clock += 4_000;
    linqStatus = "disbursed";
    expect((await getOrder(order.id)).status).toBe("paid");
    // finished: never asks again
    clock += 60_000;
    await getOrder(order.id);
    expect(linqCalls.status).toBe(2);
    expect(await store.get(order.id)).toMatchObject({ status: "paid", settledStable: 10_000_000n, settledNgn: "15000.00", linqStatus: "disbursed" });
  });

  it("never moves a status backwards, and keeps unknown status text from changing it", async () => {
    const order = await makeOrder();
    clock += 4_000;
    linqStatus = "processing: in bank queue";
    await getOrder(order.id);
    for (const s of ["initiated", "processing: wallet worker on it..", "some new status"]) {
      clock += 4_000;
      linqStatus = s;
      expect((await getOrder(order.id)).status, s).toBe("processing");
    }
    // the raw text is still recorded for support
    expect((await store.get(order.id))!.linqStatus).toBe("some new status");
  });

  it("still returns the order when Linq can't be reached", async () => {
    const order = await makeOrder();
    clock += 4_000;
    linqStatus = new LinqError(0, "no answer");
    expect((await getOrder(order.id)).status).toBe("awaiting_deposit");
    expect(logs.some((l) => l.includes("status refresh failed"))).toBe(true);
  });

  it("marks an order expired when Linq times it out", async () => {
    const order = await makeOrder();
    clock += 11 * 60_000;
    linqStatus = "timeout: no deposit received";
    expect((await getOrder(order.id)).status).toBe("expired");
  });

  it("records the first deposit transaction and ignores later ones", async () => {
    const order = await makeOrder();
    clock += 1_000;
    const res = await service.handle(signed({ action: "deposit", owner: OWNER, orderId: order.id, digest: DIGEST, timestamp: clock }));
    expect(res).toMatchObject({ action: "deposit", order: { depositDigest: DIGEST } });
    expect((await store.get(order.id))!.depositAtMs).toBe(clock);
    const other = "2rsyGcKhTVEybYgZPvykPoCxfieh9zP21LCWkWhWdgMn";
    const again = await service.handle(signed({ action: "deposit", owner: OWNER, orderId: order.id, digest: other, timestamp: clock }));
    expect(again).toMatchObject({ order: { depositDigest: DIGEST } });
    await rejects(service.handle(signed({ action: "deposit", owner: OTHER, orderId: order.id, digest: other, timestamp: clock })), "not_found", 404);
  });

  it("lists the owner's orders, newest first, and nobody else's", async () => {
    const a = await makeOrder();
    clock += 1_000;
    const b = await makeOrder();
    await makeOrder({ owner: OTHER });
    const res = await service.handle(signed({ action: "list", owner: OWNER, timestamp: clock }));
    expect(res.action === "list" && res.orders.map((o) => o.id)).toEqual([b.id, a.id]);
  });
});

describe("webhooks", () => {
  it("refuses a webhook without a valid signature, or when no secret is configured", async () => {
    const order = await makeOrder();
    const { body } = webhookBody("order.completed", `linq-${order.id}`);
    expect(await service.webhook(body, "sha256=" + "0".repeat(64))).toBe(401);
    expect(await service.webhook(body, null)).toBe(401);
    expect((await store.get(order.id))!.status).toBe("awaiting_deposit");
    const noSecret = createCashoutService({ store, linq: fakeLinq(), verifyOwner, config: { network: "mainnet", coins: {} } });
    expect(await noSecret.webhook(body, webhookBody("order.completed", `linq-${order.id}`).signature)).toBe(503);
  });

  it("rejects a signed body that isn't a Linq event", async () => {
    const body = "not json";
    expect(await service.webhook(body, "sha256=" + createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex"))).toBe(400);
    const empty = JSON.stringify({ event: "order.completed" });
    expect(await service.webhook(empty, "sha256=" + createHmac("sha256", WEBHOOK_SECRET).update(empty).digest("hex"))).toBe(400);
  });

  it("acknowledges an event for an order we don't have", async () => {
    const { body, signature } = webhookBody("order.completed", "linq-unknown");
    expect(await service.webhook(body, signature)).toBe(200);
  });

  it("moves an order through processing to paid, with what was really settled", async () => {
    const order = await makeOrder();
    let w = webhookBody("order.processing", `linq-${order.id}`, { status: "processing: in bank queue" });
    expect(await service.webhook(w.body, w.signature)).toBe(200);
    expect((await store.get(order.id))!.status).toBe("processing");
    w = webhookBody("order.completed", `linq-${order.id}`, { status: "Settled in treasury", amountStableCoin: 9.5, amountNGN: 14250 });
    expect(await service.webhook(w.body, w.signature)).toBe(200);
    expect(await store.get(order.id)).toMatchObject({ status: "paid", settledStable: 9_500_000n, settledNgn: "14250.00" });
  });

  it("ignores a late 'processing' or 'failed' once the order is paid", async () => {
    const order = await makeOrder();
    let w = webhookBody("order.completed", `linq-${order.id}`, { amountStableCoin: 10, amountNGN: 15000 });
    await service.webhook(w.body, w.signature);
    for (const event of ["order.processing", "order.failed"]) {
      w = webhookBody(event, `linq-${order.id}`, { status: "failed" });
      expect(await service.webhook(w.body, w.signature)).toBe(200);
      expect((await store.get(order.id))!.status, event).toBe("paid");
    }
  });

  it("tells a timeout from a failed payout, and lets a failed order become paid if Linq later completes it", async () => {
    const a = await makeOrder();
    let w = webhookBody("order.failed", `linq-${a.id}`, { status: "timeout: no deposit received" });
    await service.webhook(w.body, w.signature);
    expect((await store.get(a.id))!.status).toBe("expired");

    const b = await makeOrder();
    w = webhookBody("order.failed", `linq-${b.id}`, { status: "failed", amountStableCoin: 10, amountNGN: 15000 });
    await service.webhook(w.body, w.signature);
    // a failed order carries no settled amounts
    expect(await store.get(b.id)).toMatchObject({ status: "failed", settledStable: null, settledNgn: null });
    w = webhookBody("order.completed", `linq-${b.id}`, { amountStableCoin: 10, amountNGN: 15000 });
    await service.webhook(w.body, w.signature);
    expect(await store.get(b.id)).toMatchObject({ status: "paid", settledNgn: "15000.00" });
  });
});

describe("a rehearsal limited to named wallets", () => {
  it("serves only the wallets it names, and only after checking the signature", async () => {
    const s = createCashoutService({
      store,
      linq: fakeLinq(),
      verifyOwner,
      now: () => clock,
      config: { network: "mainnet", coins: { usdc: { type: USDC, decimals: 6 } }, allowedOwners: new Set([OWNER]) },
    });
    expect(s.allows(OWNER)).toBe(true);
    expect(s.allows(OWNER.toUpperCase().replace("0X", "0x"))).toBe(true);
    expect(s.allows(OTHER)).toBe(false);
    expect(s.allows("")).toBe(false);

    expect((await s.handle(signed(createMsg()))).action).toBe("create");
    await rejects(s.handle(signed(createMsg({ owner: OTHER }))), "unavailable", 503);
    // someone who isn't named can't even look up a bank account
    await rejects(s.handle(signed({ action: "verify-bank", owner: OTHER, bankCode: "033", accountNumber: "1234567890", timestamp: clock })), "unavailable", 503);
    // a forged request is still just "unauthorized": no hint about who is allowed
    await rejects(s.handle(signed(createMsg({ owner: OTHER }), OWNER)), "unauthorized", 401);
    expect(linqCalls.create).toHaveLength(1);
  });

  it("is open to every wallet when no list is set", () => {
    expect(service.allows(OTHER)).toBe(true);
    expect(service.allows("")).toBe(true);
  });
});

describe("rate", () => {
  it("caches the rate for 30 seconds and serves a recent one if Linq goes down", async () => {
    expect((await service.rate()).rate).toBe(RATE);
    await service.rate();
    expect(linqCalls.rate).toBe(1);
    clock += 30_001;
    await service.rate();
    expect(linqCalls.rate).toBe(2);
    rateError = new LinqError(503, "upstream");
    clock += 60_000;
    expect((await service.rate()).rate).toBe(RATE); // a minute old is fine for an estimate
    clock += 10 * 60_000;
    await rejects(service.rate(), "provider", 502);
  });
});
