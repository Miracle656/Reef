/// A creator coin — a standard `Coin<CREATOR_COIN>` minted to the creator, who
/// keeps the `TreasuryCap` to mint more. One published instance per creator
/// coin; DeepBook then creates the tradeable pool for it (e.g. vs DUSDC).
module creator_coin::creator_coin;

use sui::coin::{Self, TreasuryCap};

/// One-time witness. Rename the module + this struct per creator coin.
public struct CREATOR_COIN has drop {}

/// 1,000,000 tokens at 9 decimals, minted to the creator at publish.
const INITIAL_SUPPLY: u64 = 1_000_000_000_000_000;
const DECIMALS: u8 = 9;

fun init(witness: CREATOR_COIN, ctx: &mut TxContext) {
    let (mut treasury, metadata) = coin::create_currency(
        witness,
        DECIMALS,
        b"SULTAN",
        b"Sultan Coin",
        b"A creator coin on Umbra.",
        option::none(),
        ctx,
    );
    transfer::public_freeze_object(metadata);

    let creator = ctx.sender();
    let minted = coin::mint(&mut treasury, INITIAL_SUPPLY, ctx);
    transfer::public_transfer(minted, creator);
    // Creator keeps the cap to mint more / manage supply.
    transfer::public_transfer(treasury, creator);
}

/// Mint more supply (creator only — guarded by ownership of the TreasuryCap).
public fun mint(cap: &mut TreasuryCap<CREATOR_COIN>, amount: u64, recipient: address, ctx: &mut TxContext) {
    transfer::public_transfer(coin::mint(cap, amount, ctx), recipient);
}
