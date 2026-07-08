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

/** Mysten's deployed DeepBook Predict package (testnet). */
export const PREDICT_PACKAGE_ID =
  "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138";

/** dUSDC — Predict's quote/collateral coin (6 decimals). Matches apps/web. */
export const PREDICT_DUSDC_TYPE =
  "0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC";

/**
 * DeepBook Predict move-call targets the sponsor pays for — binary mint/redeem,
 * range mint/redeem, LP supply/withdraw, and the pure key constructors. Enoki
 * rejects the whole PTB if ANY move call is missing, so the key::new builders
 * (pure, but still calls inside the PTB) and refresh_oracle_mtm must be listed.
 */
export function predictAllowedTargets(pkg = PREDICT_PACKAGE_ID): string[] {
  return [
    `${pkg}::predict::create_manager`,
    `${pkg}::predict_manager::deposit`,
    `${pkg}::predict_manager::withdraw`,
    `${pkg}::market_key::new`,
    `${pkg}::range_key::new`,
    `${pkg}::predict::mint`,
    `${pkg}::predict::redeem`,
    `${pkg}::predict::mint_range`,
    `${pkg}::predict::redeem_range`,
    `${pkg}::predict::supply`,
    `${pkg}::predict::withdraw`,
    `${pkg}::predict::refresh_oracle_mtm`,
  ];
}

/**
 * Sui Stack Messaging on-chain targets — the only messaging ops that touch the
 * chain (group create/manage + membership grants). Message send/read go through
 * the relayer off-chain, so they need no sponsorship. zkLogin users have no gas,
 * so these group txs must be Enoki-sponsored → allow-listed here.
 *
 * `msgPkg` = @mysten/sui-stack-messaging testnet package; `grpPkg` = @mysten/sui-groups
 * testnet package (matches the relayer's GROUPS_PACKAGE_ID). Both auto-detected
 * by the SDK for testnet.
 */
export const MESSAGING_PACKAGE_ID =
  "0x047696be0e98f1b47a99727fecf2955cadb23c56f67c6b872b74e3ad59d51b46";
export const SUI_GROUPS_PACKAGE_ID =
  "0xba8a26d42bc8b5e5caf4dac2a0f7544128d5dd9b4614af88eec1311ade11de79";

export function messagingAllowedTargets(
  msgPkg = MESSAGING_PACKAGE_ID,
  grpPkg = SUI_GROUPS_PACKAGE_ID,
): string[] {
  return [
    `${msgPkg}::messaging::create_group`,
    `${msgPkg}::messaging::create_and_share_group`,
    `${msgPkg}::messaging::rotate_encryption_key`,
    `${msgPkg}::messaging::archive_group`,
    `${msgPkg}::messaging::set_group_name`,
    `${msgPkg}::messaging::insert_group_data`,
    `${msgPkg}::messaging::remove_group_data`,
    `${grpPkg}::permissioned_group::grant_permission`,
    `${grpPkg}::permissioned_group::remove_member`,
    `${grpPkg}::permissioned_group::revoke_permission`,
    // Objects are shared inside create_and_share_group; include the generic
    // share target too in case a build path emits it separately.
    `0x0000000000000000000000000000000000000000000000000000000000000002::transfer::public_share_object`,
  ];
}
