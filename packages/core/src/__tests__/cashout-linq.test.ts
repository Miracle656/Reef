import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createLinqClient, createMockLinqClient, DEFAULT_LINQ_BASE_URL, LinqError, verifyLinqSignature } from "../server";

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };

/** A fetch that answers from a queue and records what it was asked. */
function fakeFetch(answers: (Response | Error)[]) {
  const calls: Call[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const next = answers.shift();
    if (!next) throw new Error("fakeFetch: no answer queued");
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;
  return { impl, calls };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const ORDER = {
  id: "linq-1",
  walletAddress: "0x" + "d".repeat(64),
  coinType: "0x44f838219cf67b058f3b37907b655f226153c18e33dfcd0da559a844fea9b1c1::usdsui::USDSUI",
  coin: "usdsui",
  amountStableCoin: 1.22,
  amountNGN: 2000,
  rate: 1639.34,
  currency: "NGN",
  status: "initiated",
};

const REQUEST = {
  amountNGN: 2000,
  coin: "usdsui" as const,
  bankAccount: "1234567890",
  bankCode: "033",
  bankName: "United Bank for Africa",
  accountName: "John Doe",
  refundAddress: "0x" + "a".repeat(64),
  customerRef: "0x" + "a".repeat(64),
  idempotencyKey: "3f7c1b2a-84e9-4c11-b3d2-0a9f7e123456",
};

describe("Linq client", () => {
  it("reads the public rate without sending the API key", async () => {
    const f = fakeFetch([json({ rate: 1655, currency: "NGN", coin: "USDSUI" })]);
    const linq = createLinqClient({ apiKey: "biz_live_secret", fetch: f.impl });
    expect((await linq.getRate()).rate).toBe(1655);
    expect(f.calls[0]!.url).toBe(`${DEFAULT_LINQ_BASE_URL}/b2b/rate`);
    expect(f.calls[0]!.headers["X-API-Key"]).toBeUndefined();
  });

  it("creates an order as a manual deposit on Sui, with the key and the idempotency key", async () => {
    const f = fakeFetch([json(ORDER, 201)]);
    const linq = createLinqClient({ apiKey: "biz_live_secret", baseUrl: "https://linq.example/", fetch: f.impl });
    const order = await linq.createOfframp(REQUEST);
    expect(order.walletAddress).toBe(ORDER.walletAddress);
    const call = f.calls[0]!;
    expect(call.url).toBe("https://linq.example/b2b/offramp");
    expect(call.method).toBe("POST");
    expect(call.headers["X-API-Key"]).toBe("biz_live_secret");
    expect(call.body).toEqual({ ...REQUEST, chain: "sui", currency: "NGN", manualDeposit: true });
  });

  it("can't be asked to turn manualDeposit off", async () => {
    const f = fakeFetch([json(ORDER, 201)]);
    const linq = createLinqClient({ apiKey: "k", fetch: f.impl });
    // a caller smuggling the flag in still gets `true` on the wire
    await linq.createOfframp({ ...REQUEST, ...({ manualDeposit: false } as object) });
    expect((f.calls[0]!.body as { manualDeposit: boolean }).manualDeposit).toBe(true);
  });

  it("insists on exactly one amount, before anything is sent", async () => {
    const f = fakeFetch([]);
    const linq = createLinqClient({ apiKey: "k", fetch: f.impl });
    await expect(linq.createOfframp({ ...REQUEST, amountStableCoin: 1 })).rejects.toThrow(/exactly one/);
    const { amountNGN: _drop, ...none } = REQUEST;
    await expect(linq.createOfframp(none)).rejects.toThrow(/exactly one/);
    expect(f.calls).toHaveLength(0);
  });

  it("looks up a bank account and an order's status", async () => {
    const f = fakeFetch([
      json({ accountName: "John Doe", bankName: "United Bank for Africa", accountNumber: "1234567890", bankCode: "033" }),
      json({ id: "linq 1", status: "disbursed", amountStableCoin: 50, amountNGN: 82750 }),
    ]);
    const linq = createLinqClient({ apiKey: "k", fetch: f.impl });
    expect((await linq.verifyBank({ bankCode: "033", accountNumber: "1234567890" })).accountName).toBe("John Doe");
    expect(f.calls[0]!.body).toEqual({ bankCode: "033", accountNumber: "1234567890" });
    expect((await linq.getStatus("linq 1")).status).toBe("disbursed");
    expect(f.calls[1]!.url).toBe(`${DEFAULT_LINQ_BASE_URL}/b2b/status?id=linq%201`);
    expect(f.calls[1]!.headers["X-API-Key"]).toBe("k");
  });

  it("turns Linq's error body into a LinqError and doesn't retry a refusal", async () => {
    const f = fakeFetch([json({ message: "invalid bank account" }, 400)]);
    const linq = createLinqClient({ apiKey: "k", fetch: f.impl });
    const err = await linq.verifyBank({ bankCode: "033", accountNumber: "0000000000" }).catch((e) => e);
    expect(err).toBeInstanceOf(LinqError);
    expect(err).toMatchObject({ status: 400, message: "invalid bank account", transient: false });
    expect(f.calls).toHaveLength(1);
  });

  it("retries when Linq is down or unreachable, then gives up with the last error", async () => {
    const f = fakeFetch([new Error("socket hang up"), json({ message: "upstream" }, 503), json(ORDER, 201)]);
    const linq = createLinqClient({ apiKey: "k", fetch: f.impl });
    expect((await linq.createOfframp(REQUEST)).id).toBe("linq-1");
    expect(f.calls).toHaveLength(3);
    // every attempt carried the same idempotency key, so a retry can't make a second order
    expect(new Set(f.calls.map((c) => (c.body as { idempotencyKey: string }).idempotencyKey)).size).toBe(1);

    const down = fakeFetch([json({}, 500), json({}, 500), json({}, 500)]);
    const err = await createLinqClient({ apiKey: "k", fetch: down.impl }).getRate().catch((e) => e);
    expect(err).toMatchObject({ status: 500, transient: true });
    expect(down.calls).toHaveLength(3);
  }, 15_000);

  it("refuses an answer that isn't the shape it expects", async () => {
    for (const body of [{ ...ORDER, walletAddress: undefined }, { ...ORDER, amountStableCoin: "1.22" }, { ...ORDER, rate: 0 }, "<html>oops</html>"]) {
      const f = fakeFetch([typeof body === "string" ? new Response(body, { status: 200 }) : json(body, 201)]);
      const err = await createLinqClient({ apiKey: "k", fetch: f.impl }).createOfframp(REQUEST).catch((e) => e);
      expect(err, JSON.stringify(body)).toBeInstanceOf(LinqError);
      // a malformed success is not retried: Linq may already have made the order
      expect(f.calls).toHaveLength(1);
    }
  });
});

describe("verifyLinqSignature", () => {
  const secret = "whsec_test";
  const body = JSON.stringify({ event: "order.completed", orderId: "linq-1", amountNGN: 82750 });
  const sign = (b: string, s = secret) => "sha256=" + createHmac("sha256", s).update(b).digest("hex");

  it("accepts the HMAC of the raw body", () => {
    expect(verifyLinqSignature(body, sign(body), secret)).toBe(true);
    expect(verifyLinqSignature(body, `  ${sign(body)}  `, secret)).toBe(true);
  });

  it("matches the worked example from RFC 4231 (so the HMAC itself is right)", () => {
    // RFC 4231 test case 2: key "Jefe", data "what do ya want for nothing?"
    const expected = "sha256=5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843";
    expect(verifyLinqSignature("what do ya want for nothing?", expected, "Jefe")).toBe(true);
  });

  it("rejects a changed body, a wrong secret, and malformed or missing headers", () => {
    expect(verifyLinqSignature(body.replace("82750", "827500"), sign(body), secret)).toBe(false);
    expect(verifyLinqSignature(body, sign(body, "other"), secret)).toBe(false);
    expect(verifyLinqSignature(body, sign(body).slice(7), secret)).toBe(false); // no "sha256=" prefix
    expect(verifyLinqSignature(body, sign(body).toUpperCase(), secret)).toBe(false);
    expect(verifyLinqSignature(body, "sha256=", secret)).toBe(false);
    expect(verifyLinqSignature(body, "", secret)).toBe(false);
    expect(verifyLinqSignature(body, null, secret)).toBe(false);
    expect(verifyLinqSignature(body, undefined, secret)).toBe(false);
    expect(verifyLinqSignature(body, sign(body), "")).toBe(false);
  });
});

describe("mock Linq (rehearsal)", () => {
  const coinTypes = { usdc: "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC" };
  const DEPOSIT = "0x" + "d".repeat(64);
  let clock = 1_000_000;
  let order: { createdAtMs: number; depositAtMs: number | null; amountStableCoin: number; amountNGN: number } | null = null;
  const mock = createMockLinqClient({ depositAddress: DEPOSIT, coinTypes, rate: 1500, now: () => clock, lookup: async () => order });

  it("quotes like Linq: naira-first rounds the dollars up to the cent", async () => {
    const o = await mock.createOfframp({ ...REQUEST, coin: "usdc", amountNGN: 2000 });
    expect(o).toMatchObject({ id: `mock-${REQUEST.idempotencyKey}`, walletAddress: DEPOSIT, coinType: coinTypes.usdc, chain: "sui", amountStableCoin: 1.34, amountNGN: 2000, rate: 1500 });
    const { amountNGN: _drop, ...rest } = REQUEST;
    const s = await mock.createOfframp({ ...rest, coin: "usdc", amountStableCoin: 10 });
    expect(s).toMatchObject({ amountStableCoin: 10, amountNGN: 15000 });
  });

  it("refuses a coin it has no type for, and an account ending 0000", async () => {
    await expect(mock.createOfframp({ ...REQUEST, coin: "usdsui" })).rejects.toBeInstanceOf(LinqError);
    await expect(mock.verifyBank({ bankCode: "033", accountNumber: "1234560000" })).rejects.toMatchObject({ status: 400 });
    expect((await mock.verifyBank({ bankCode: "033", accountNumber: "1234567890" })).accountName).toMatch(/TEST/);
  });

  it("walks an order through Linq's status texts", async () => {
    order = { createdAtMs: clock, depositAtMs: null, amountStableCoin: 1.34, amountNGN: 2000 };
    expect((await mock.getStatus("mock-x")).status).toBe("processing: wallet worker on it..");
    clock += 11 * 60_000;
    expect((await mock.getStatus("mock-x")).status).toBe("timeout: no deposit received");
    order = { ...order, depositAtMs: clock };
    expect((await mock.getStatus("mock-x")).status).toBe("processing: in bank queue");
    clock += 16_000;
    expect(await mock.getStatus("mock-x")).toMatchObject({ status: "Settled in treasury", amountNGN: 2000 });
    order = null;
    await expect(mock.getStatus("mock-x")).rejects.toMatchObject({ status: 404 });
  });
});
