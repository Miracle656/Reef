/// TESTNET ONLY. A stand-in USDC anyone can mint a little of, so savings can be
/// tried without real USDC. (The testnet dUSDC ReeF tips with has no public
/// mint.) Never deploy this module's coin as "USDC" on mainnet: point
/// `create_vault` / `create_config` at Circle's native USDC instead.
module reef_savings::test_usdc;

use sui::coin::{Self, Coin, TreasuryCap};

public struct TEST_USDC has drop {}

/// Most a single `mint` call hands out: 1,000 test USDC.
const MAX_MINT: u64 = 1_000_000_000;

const ETooMuch: u64 = 0;

/// Shared faucet holding the mint authority.
public struct Faucet has key {
    id: UID,
    cap: TreasuryCap<TEST_USDC>,
}

#[allow(deprecated_usage)]
fun init(otw: TEST_USDC, ctx: &mut TxContext) {
    let (cap, metadata) = coin::create_currency(
        otw,
        6,
        b"tUSDC",
        b"ReeF test USDC",
        b"Testnet-only stand-in for USDC (ReeF savings)",
        option::none(),
        ctx,
    );
    transfer::public_freeze_object(metadata);
    transfer::share_object(Faucet { id: object::new(ctx), cap });
}

/// Mint up to 1,000 test USDC to the caller's PTB.
public fun mint(faucet: &mut Faucet, amount: u64, ctx: &mut TxContext): Coin<TEST_USDC> {
    assert!(amount <= MAX_MINT, ETooMuch);
    coin::mint(&mut faucet.cap, amount, ctx)
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) { init(TEST_USDC {}, ctx) }
