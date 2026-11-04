import { createSuiClient } from "@umbra/core";
import { umbraConfig } from "./config";

const client = createSuiClient(umbraConfig);

async function findOwned(owner: string, typeSuffix: string): Promise<string | null> {
  const res = await client.listOwnedObjects({ owner, type: `${umbraConfig.packageId}::${typeSuffix}`, limit: 1 });
  return res.objects[0]?.objectId ?? null;
}

export const getFollowSetId = (owner: string) => findOwned(owner, "follow::FollowSet");
