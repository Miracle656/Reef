import { createSuiClient } from "@umbra/core";
import { umbraConfig } from "./config";

const client = createSuiClient(umbraConfig);

async function findOwned(owner: string, typeSuffix: string): Promise<string | null> {
  const res = await client.getOwnedObjects({
    owner,
    filter: { StructType: `${umbraConfig.packageId}::${typeSuffix}` },
    options: { showType: true },
    limit: 1,
  });
  return res.data[0]?.data?.objectId ?? null;
}

export const getFollowSetId = (owner: string) => findOwned(owner, "follow::FollowSet");
