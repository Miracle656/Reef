/**
 * SERVER-ONLY. Wraps the Enoki private-key client used by the sponsor endpoint.
 * Importing this in a browser/app bundle would leak the private API key — it is
 * exported via `@umbra/core/server`, not the default entrypoint.
 */
import { EnokiClient } from "@mysten/enoki";
import type { SuiNetwork } from "../config";

export function createEnokiClient(apiKey: string): EnokiClient {
  return new EnokiClient({ apiKey });
}

export interface SponsorParams {
  network: SuiNetwork;
  transactionKindBytes: string;
  sender: string;
  /** restrict what the sponsor will pay for — set to our package's targets */
  allowedMoveCallTargets?: string[];
  allowedAddresses?: string[];
}

/** Step 1: ask Enoki to sponsor (fund + co-sign gas for) the transaction. */
export async function sponsorTransaction(
  enoki: EnokiClient,
  params: SponsorParams,
): Promise<{ bytes: string; digest: string }> {
  return enoki.createSponsoredTransaction({
    network: params.network,
    transactionKindBytes: params.transactionKindBytes,
    sender: params.sender,
    allowedMoveCallTargets: params.allowedMoveCallTargets,
    allowedAddresses: params.allowedAddresses,
  });
}

/** Step 2: execute the sponsored tx once the user has signed `bytes`. */
export async function executeSponsoredTransaction(
  enoki: EnokiClient,
  params: { digest: string; signature: string },
): Promise<{ digest: string }> {
  return enoki.executeSponsoredTransaction({
    digest: params.digest,
    signature: params.signature,
  });
}

/** Move-call targets the sponsor is allowed to pay for (lock down abuse). */
export function umbraAllowedTargets(packageId: string): string[] {
  return [
    `${packageId}::profile::create_profile`,
    `${packageId}::profile::update_profile`,
    `${packageId}::profile::change_handle`,
    `${packageId}::profile::set_suins_name`,
    `${packageId}::post::create_post`,
    `${packageId}::post::edit_post`,
    `${packageId}::post::delete_post`,
    `${packageId}::follow::create_follow_set`,
    `${packageId}::follow::follow`,
    `${packageId}::follow::unfollow`,
  ];
}
