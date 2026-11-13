/// TESTNET STAND-IN for a lending market (#15). Shaped like Scallop's sCoin /
/// Suilend's cToken: deposit `T`, receive a fungible receipt
/// `Coin<MOCK_YIELD>` whose exchange rate (underlying per receipt) rises over
/// time. Supply only changes on deposit/redeem; yield shows up as a rising rate.
///
/// The rate accrues linearly from `apr_bps` against the shared `Clock` on every
/// interaction. Yield is only BACKED once the admin tops the vault up
/// (`top_up`). Until then, late redeemers can hit `ENotEnoughLiquidity`, which
/// is the same failure a real market shows at 100% utilisation. Admin knobs
/// (`set_apr`, `haircut`) exist so testnet can simulate rate changes and bad
/// debt. A real lender has neither.
module reef_savings::mock_yield;

use sui::balance::{Self, Balance};
use sui::clock::Clock;
use sui::coin::{Self, Coin, TreasuryCap};
use sui::event;

/// Receipt coin (one-time witness). 6 decimals, like USDC.
public struct MOCK_YIELD has drop {}

/// Fixed-point scale for the exchange rate: 1e9 == 1 underlying per receipt.
const RATE_SCALE: u128 = 1_000_000_000;
const MS_PER_YEAR: u128 = 365 * 24 * 60 * 60 * 1000;
const MAX_APR_BPS: u64 = 5_000; // 50%: a mock, but keep it sane

const EZeroAmount: u64 = 0;
const ENotEnoughLiquidity: u64 = 1;
const EAprTooHigh: u64 = 2;
const EHaircutTooBig: u64 = 3;

/// Lets the publisher create vaults and turn the mock's knobs.
public struct AdminCap has key, store { id: UID }

/// Holds the receipt `TreasuryCap` until the first vault is created.
public struct ReceiptMint has key { id: UID, cap: TreasuryCap<MOCK_YIELD> }

/// One lending market for underlying `T` (shared).
public struct MockVault<phantom T> has key {
    id: UID,
    underlying: Balance<T>,
    receipts: TreasuryCap<MOCK_YIELD>,
    /// underlying per receipt, scaled by RATE_SCALE
    rate: u128,
    last_ms: u64,
    apr_bps: u64,
}

public struct Deposited has copy, drop { vault: ID, amount: u64, receipts: u64, rate: u128 }
public struct Redeemed has copy, drop { vault: ID, amount: u64, receipts: u64, rate: u128 }

// A mock receipt coin: the classic create_currency is fine here (coin_registry
// matters for real, discoverable currencies).
#[allow(deprecated_usage)]
fun init(otw: MOCK_YIELD, ctx: &mut TxContext) {
    let (cap, metadata) = coin::create_currency(
        otw,
        6,
        b"mUSDC",
        b"ReeF mock savings receipt",
        b"Testnet stand-in for a lender's receipt token",
        option::none(),
        ctx,
    );
    transfer::public_freeze_object(metadata);
    transfer::transfer(ReceiptMint { id: object::new(ctx), cap }, ctx.sender());
    transfer::public_transfer(AdminCap { id: object::new(ctx) }, ctx.sender());
}

/// Create THE vault for underlying `T` (consumes the receipt mint, so there is
/// exactly one vault per publish).
public fun create_vault<T>(_: &AdminCap, mint: ReceiptMint, apr_bps: u64, clock: &Clock, ctx: &mut TxContext) {
    assert!(apr_bps <= MAX_APR_BPS, EAprTooHigh);
    let ReceiptMint { id, cap } = mint;
    id.delete();
    transfer::share_object(MockVault<T> {
        id: object::new(ctx),
        underlying: balance::zero(),
        receipts: cap,
        rate: RATE_SCALE,
        last_ms: clock.timestamp_ms(),
        apr_bps,
    });
}

/// Rate as of `now_ms` (pure; doesn't write).
fun projected_rate<T>(v: &MockVault<T>, now_ms: u64): u128 {
    if (now_ms <= v.last_ms) return v.rate;
    let dt = ((now_ms - v.last_ms) as u128);
    v.rate + v.rate * (v.apr_bps as u128) * dt / (10_000 * MS_PER_YEAR)
}

fun accrue<T>(v: &mut MockVault<T>, clock: &Clock) {
    let now = clock.timestamp_ms();
    v.rate = projected_rate(v, now);
    if (now > v.last_ms) v.last_ms = now;
}

/// Deposit `T`, get receipts at the current rate (rounded down).
public fun deposit<T>(v: &mut MockVault<T>, coin: Coin<T>, clock: &Clock, ctx: &mut TxContext): Coin<MOCK_YIELD> {
    let amount = coin.value();
    assert!(amount > 0, EZeroAmount);
    accrue(v, clock);
    let receipts = ((amount as u128) * RATE_SCALE / v.rate) as u64;
    assert!(receipts > 0, EZeroAmount);
    v.underlying.join(coin.into_balance());
    event::emit(Deposited { vault: object::id(v), amount, receipts, rate: v.rate });
    coin::mint(&mut v.receipts, receipts, ctx)
}

/// Burn receipts for `T` at the current rate (rounded down). Aborts with
/// `ENotEnoughLiquidity` when the vault can't pay, like a fully-utilised market.
public fun redeem<T>(v: &mut MockVault<T>, receipt: Coin<MOCK_YIELD>, clock: &Clock, ctx: &mut TxContext): Coin<T> {
    let receipts = receipt.value();
    assert!(receipts > 0, EZeroAmount);
    accrue(v, clock);
    let amount = ((receipts as u128) * v.rate / RATE_SCALE) as u64;
    assert!(amount <= v.underlying.value(), ENotEnoughLiquidity);
    coin::burn(&mut v.receipts, receipt);
    event::emit(Redeemed { vault: object::id(v), amount, receipts, rate: v.rate });
    coin::from_balance(v.underlying.split(amount), ctx)
}

// ---- views ----

/// Underlying per receipt (scaled by 1e9) right now.
public fun exchange_rate<T>(v: &MockVault<T>, clock: &Clock): u128 { projected_rate(v, clock.timestamp_ms()) }
public fun rate_scale(): u128 { RATE_SCALE }
public fun apr_bps<T>(v: &MockVault<T>): u64 { v.apr_bps }
/// Underlying `T` the vault can pay out right now.
public fun liquidity<T>(v: &MockVault<T>): u64 { v.underlying.value() }
/// Receipts outstanding.
public fun receipt_supply<T>(v: &MockVault<T>): u64 { v.receipts.total_supply() }
/// Value of `receipts` in `T` at the current rate (rounded down).
public fun value_of<T>(v: &MockVault<T>, receipts: u64, clock: &Clock): u64 {
    ((receipts as u128) * projected_rate(v, clock.timestamp_ms()) / RATE_SCALE) as u64
}

// ---- mock-only admin knobs (a real lender has none of these) ----

/// Fund the yield: adds underlying without minting receipts.
public fun top_up<T>(v: &mut MockVault<T>, coin: Coin<T>) { v.underlying.join(coin.into_balance()); }

public fun set_apr<T>(_: &AdminCap, v: &mut MockVault<T>, apr_bps: u64, clock: &Clock) {
    assert!(apr_bps <= MAX_APR_BPS, EAprTooHigh);
    accrue(v, clock);
    v.apr_bps = apr_bps;
}

/// Simulate bad debt: cut the rate by `bps` (so receipts are worth less).
public fun haircut<T>(_: &AdminCap, v: &mut MockVault<T>, bps: u64, clock: &Clock) {
    assert!(bps < 10_000, EHaircutTooBig);
    accrue(v, clock);
    v.rate = v.rate * ((10_000 - bps) as u128) / 10_000;
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) { init(MOCK_YIELD {}, ctx) }
