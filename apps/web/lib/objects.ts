import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { umbraConfig } from "./config";

/** Find the id of an owned object of a given module::type for `owner`. */
async function findOwned(client: SuiJsonRpcClient, owner: string, typeSuffix: string): Promise<string | null> {
  const structType = `${umbraConfig.packageId}::${typeSuffix}`;
  const res = await client.getOwnedObjects({
    owner,
    filter: { StructType: structType },
    options: { showType: true },
    limit: 1,
  });
  return res.data[0]?.data?.objectId ?? null;
}

export const getFollowSetId = (client: SuiJsonRpcClient, owner: string) =>
  findOwned(client, owner, "follow::FollowSet");

export const getProfileId = (client: SuiJsonRpcClient, owner: string) =>
  findOwned(client, owner, "profile::Profile");
