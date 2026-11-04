import { describe, expect, it } from "vitest";
import { MAX_EPOCHS_AHEAD, planRenewals } from "../walrus-renew";

describe("planRenewals", () => {
  const blobs = [
    { objectId: "0xa", endEpoch: 572 }, // 1 left -> extend
    { objectId: "0xb", endEpoch: 578 }, // 7 left -> at threshold, extend
    { objectId: "0xc", endEpoch: 579 }, // 8 left -> skip
    { objectId: "0xd", endEpoch: 571 }, // expired -> skip
    { objectId: "0xe", endEpoch: 560 }, // expired -> skip
  ];

  it("extends only blobs within the threshold, up to the target", () => {
    const plan = planRenewals(blobs, 571, 7, 50);
    expect(plan).toEqual([
      { blobObjectId: "0xa", endEpoch: 572, extendBy: 49 },
      { blobObjectId: "0xb", endEpoch: 578, extendBy: 43 },
    ]);
  });

  it("never plans past the Walrus max epochs ahead", () => {
    const plan = planRenewals([{ objectId: "0xa", endEpoch: 572 }], 571, 7, 999);
    expect(plan[0]!.extendBy).toBe(MAX_EPOCHS_AHEAD - 1);
  });

  it("does nothing when the target is not beyond what remains", () => {
    expect(planRenewals([{ objectId: "0xa", endEpoch: 575 }], 571, 7, 3)).toEqual([]);
  });
});
