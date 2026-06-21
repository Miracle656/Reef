import { afterEach, describe, expect, it, vi } from "vitest";
import { WALRUS_TESTNET } from "../config";
import { blobUrl, readBlob, uploadBlob } from "../walrus/index";

afterEach(() => vi.restoreAllMocks());

describe("walrus", () => {
  it("builds a read url from the first aggregator", () => {
    expect(blobUrl(WALRUS_TESTNET, "BLOB123")).toBe(
      "https://aggregator.walrus-testnet.walrus.space/v1/blobs/BLOB123",
    );
  });

  it("uploads and extracts a newly-created blobId", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ newlyCreated: { blobObject: { blobId: "NEWBLOB" } } }), { status: 200 }),
      ),
    );
    const res = await uploadBlob(WALRUS_TESTNET, new Uint8Array([1, 2, 3]), { epochs: 5 });
    expect(res.blobId).toBe("NEWBLOB");
    expect(res.newlyCreated).toBe(true);
  });

  it("falls back to the next publisher on failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("boom", { status: 500 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ alreadyCertified: { blobId: "DEDUP" } }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const res = await uploadBlob(WALRUS_TESTNET, new Uint8Array([9]));
    expect(res.blobId).toBe("DEDUP");
    expect(res.newlyCreated).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reads blob bytes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([7, 7]).buffer, { status: 200 })));
    const bytes = await readBlob(WALRUS_TESTNET, "X");
    expect(Array.from(bytes)).toEqual([7, 7]);
  });
});
