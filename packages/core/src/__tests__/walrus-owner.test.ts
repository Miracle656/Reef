import { afterEach, describe, expect, it, vi } from "vitest";
import { WALRUS_TESTNET } from "../config";
import { extractBlobId, uploadBlob } from "../walrus/index";

describe("extractBlobId", () => {
  it("reads object id + end epoch from a fresh upload", () => {
    expect(
      extractBlobId({ newlyCreated: { blobObject: { id: "0xobj", blobId: "B1", storage: { endEpoch: 572 } } } }),
    ).toEqual({ blobId: "B1", newlyCreated: true, blobObjectId: "0xobj", endEpoch: 572 });
  });
  it("reads already-certified blobs", () => {
    expect(extractBlobId({ alreadyCertified: { blobId: "B2", endEpoch: 600 } })).toEqual({
      blobId: "B2",
      newlyCreated: false,
      endEpoch: 600,
    });
  });
});

describe("uploadBlob", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends the blob to blobOwner when configured", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ alreadyCertified: { blobId: "B" } })));
    vi.stubGlobal("fetch", fetchMock);
    await uploadBlob({ ...WALRUS_TESTNET, blobOwner: "0xabc" }, new Uint8Array([1]));
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain("&send_object_to=0xabc");
  });

  it("omits send_object_to without an owner", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ alreadyCertified: { blobId: "B" } })));
    vi.stubGlobal("fetch", fetchMock);
    await uploadBlob(WALRUS_TESTNET, new Uint8Array([1]));
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).not.toContain("send_object_to");
  });
});
