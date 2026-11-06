import type { SuiGrpcClient } from "@mysten/sui/grpc";
import { umbraConfig } from "./config";

/** Find the id of an owned object of a given module::type for `owner`. */
async function findOwned(client: SuiGrpcClient, owner: string, typeSuffix: string): Promise<string | null> {
  const res = await client.listOwnedObjects({ owner, type: `${umbraConfig.packageId}::${typeSuffix}`, limit: 1 });
  return res.objects[0]?.objectId ?? null;
}

export const getFollowSetId = (client: SuiGrpcClient, owner: string) =>
  findOwned(client, owner, "follow::FollowSet");

export const getProfileId = (client: SuiGrpcClient, owner: string) =>
  findOwned(client, owner, "profile::Profile");
