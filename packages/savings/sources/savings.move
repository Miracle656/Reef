/// USDC savings (#15), non-custodial. Two pots:
///
/// - **Flex**: the user deposits into the lender and holds the lender's
///   receipt coin in their own address. ReeF holds nothing. Withdraw any time
///   the market has liquidity.
/// - **Lock**: a `SavingsLock` the user owns, wrapping their receipts, with
///   `unlock_ms` checked against the Clock. It has `key` but not `store`, so it
///   can't be transferred or unwrapped except through this module.
///   Breaking early (if `breakable`) forfeits the YIELD, never principal; the
///   forfeit goes to a `BonusPool` for people who hold to maturity, never to
///   ReeF. If the rate has FALLEN below principal (lender bad debt), breaking
///   returns everything instead of aborting.
/// - **Halal lock**: a 0% lock that never touches a lender: it just holds the
///   coin until `unlock_ms`.
///
/// ReeF's parameters live in a FROZEN `SavingsConfig` (allowed coin type,
/// allowed durations), so nothing shared is touched on the hot path except
/// the lender, and nobody (ReeF included) can change the rules under a lock.
module reef_savings::savings;

use reef_savings::mock_yield::{Self, AdminCap, MockVault, MOCK_YIELD};
use std::type_name::{Self, TypeName};
use sui::balance::{Self, Balance};
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;

const EWrongCoin: u64 = 0;
const EBadDuration: u64 = 1;
const ENotMatured: u64 = 2;
const EUnbreakable: u64 = 3;
const EAlreadyMatured: u64 = 4;
const EZeroAmount: u64 = 5;
const ENotOwner: u64 = 6;

/// Immutable rules (frozen at creation).
public struct SavingsConfig has key {
    id: UID,
    /// the only coin type savings accepts (USDC)
    underlying: TypeName,
    /// allowed lock lengths in ms (e.g. 1, 3, 6, 12 months)
    durations_ms: vector<u64>,
}

/// Forfeited early-break yield, for people who hold to maturity (shared;
/// touched only on the cold break path). Paying it out is a later decision.
public struct BonusPool has key {
    id: UID,
    receipts: Balance<MOCK_YIELD>,
}

public enum Holding<phantom T> has store {
    /// lender receipts (earns the variable rate)
    Lender { receipts: Balance<MOCK_YIELD> },
    /// 0% Halal lock: the coin itself, never lent out
    Halal { funds: Balance<T> },
}

/// A user's locked pot. `key` only: not transferable, not wrappable.
public struct SavingsLock<phantom T> has key {
    id: UID,
    owner: address,
    /// what went in, in `T` base units (for display + the break rule)
    principal: u64,
    holding: Holding<T>,
    created_ms: u64,
    unlock_ms: u64,
    breakable: bool,
}

public struct FlexDeposited has copy, drop { owner: address, amount: u64, receipts: u64 }
public struct FlexWithdrawn has copy, drop { owner: address, amount: u64, receipts: u64 }
public struct LockOpened has copy, drop {
    lock_id: ID,
    owner: address,
    principal: u64,
    receipts: u64,
    unlock_ms: u64,
    breakable: bool,
    halal: bool,
}
public struct LockWithdrawn has copy, drop { lock_id: ID, owner: address, amount: u64 }
public struct LockBroken has copy, drop { lock_id: ID, owner: address, returned: u64, forfeited_receipts: u64 }

/// Publisher-only: freeze the rules for coin `T` and create the bonus pool.
public fun create_config<T>(_: &AdminCap, durations_ms: vector<u64>, ctx: &mut TxContext) {
    transfer::freeze_object(SavingsConfig { id: object::new(ctx), underlying: type_name::with_defining_ids<T>(), durations_ms });
    transfer::share_object(BonusPool { id: object::new(ctx), receipts: balance::zero() });
}

fun assert_coin<T>(cfg: &SavingsConfig) {
    assert!(type_name::with_defining_ids<T>() == cfg.underlying, EWrongCoin);
}

// ---- Flex: the user holds the lender's receipt ----

public fun deposit_flex<T>(
    cfg: &SavingsConfig,
    vault: &mut MockVault<T>,
    coin: Coin<T>,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<MOCK_YIELD> {
    assert_coin<T>(cfg);
    let amount = coin.value();
    let receipt = mock_yield::deposit(vault, coin, clock, ctx);
    event::emit(FlexDeposited { owner: ctx.sender(), amount, receipts: receipt.value() });
    receipt
}

public fun withdraw_flex<T>(
    cfg: &SavingsConfig,
    vault: &mut MockVault<T>,
    receipt: Coin<MOCK_YIELD>,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<T> {
    assert_coin<T>(cfg);
    let receipts = receipt.value();
    let out = mock_yield::redeem(vault, receipt, clock, ctx);
    event::emit(FlexWithdrawn { owner: ctx.sender(), amount: out.value(), receipts });
    out
}

// ---- Lock ----

fun check_duration(cfg: &SavingsConfig, duration_ms: u64) {
    assert!(cfg.durations_ms.contains(&duration_ms), EBadDuration);
}

/// Lock `coin` with the lender for `duration_ms`. The lock is sent to the
/// sender by the module (a `key`-only object can't be moved by the PTB).
public fun open_lock<T>(
    cfg: &SavingsConfig,
    vault: &mut MockVault<T>,
    coin: Coin<T>,
    duration_ms: u64,
    breakable: bool,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert_coin<T>(cfg);
    check_duration(cfg, duration_ms);
    let principal = coin.value();
    assert!(principal > 0, EZeroAmount);
    let receipt = mock_yield::deposit(vault, coin, clock, ctx);
    let receipts = receipt.value();
    finish_open<T>(principal, receipts, Holding<T>::Lender { receipts: receipt.into_balance() }, duration_ms, breakable, false, clock, ctx);
}

/// 0% Halal lock: holds the coin itself; never touches a lender.
public fun open_halal_lock<T>(
    cfg: &SavingsConfig,
    coin: Coin<T>,
    duration_ms: u64,
    breakable: bool,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert_coin<T>(cfg);
    check_duration(cfg, duration_ms);
    let principal = coin.value();
    assert!(principal > 0, EZeroAmount);
    finish_open(principal, 0, Holding::Halal { funds: coin.into_balance() }, duration_ms, breakable, true, clock, ctx);
}

fun finish_open<T>(
    principal: u64,
    receipts: u64,
    holding: Holding<T>,
    duration_ms: u64,
    breakable: bool,
    halal: bool,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let now = clock.timestamp_ms();
    let lock = SavingsLock<T> {
        id: object::new(ctx),
        owner: ctx.sender(),
        principal,
        holding,
        created_ms: now,
        unlock_ms: now + duration_ms,
        breakable,
    };
    event::emit(LockOpened {
        lock_id: object::id(&lock),
        owner: ctx.sender(),
        principal,
        receipts,
        unlock_ms: lock.unlock_ms,
        breakable,
        halal,
    });
    transfer::transfer(lock, ctx.sender());
}

/// After `unlock_ms`: everything (principal + yield) back to the owner.
public fun withdraw_matured<T>(
    cfg: &SavingsConfig,
    lock: SavingsLock<T>,
    vault: &mut MockVault<T>,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<T> {
    assert_coin<T>(cfg);
    assert!(lock.owner == ctx.sender(), ENotOwner);
    assert!(clock.timestamp_ms() >= lock.unlock_ms, ENotMatured);
    let SavingsLock { id, owner, principal: _, holding, created_ms: _, unlock_ms: _, breakable: _ } = lock;
    let lock_id = id.to_inner();
    id.delete();
    let out = match (holding) {
        Holding::Lender { receipts } => mock_yield::redeem(vault, coin::from_balance(receipts, ctx), clock, ctx),
        Holding::Halal { funds } => coin::from_balance(funds, ctx),
    };
    event::emit(LockWithdrawn { lock_id, owner, amount: out.value() });
    out
}

/// Before `unlock_ms`, on a breakable lock: get back the principal, forfeit
/// the yield to the bonus pool. If the rate fell (lender bad debt), the
/// receipts are worth less than principal: return ALL of them, don't abort.
public fun break_early<T>(
    cfg: &SavingsConfig,
    lock: SavingsLock<T>,
    vault: &mut MockVault<T>,
    pool: &mut BonusPool,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<T> {
    assert_coin<T>(cfg);
    assert!(lock.owner == ctx.sender(), ENotOwner);
    assert!(lock.breakable, EUnbreakable);
    assert!(clock.timestamp_ms() < lock.unlock_ms, EAlreadyMatured);
    let SavingsLock { id, owner, principal, holding, created_ms: _, unlock_ms: _, breakable: _ } = lock;
    let lock_id = id.to_inner();
    id.delete();
    let (out, forfeited) = match (holding) {
        Holding::Halal { funds } => (coin::from_balance(funds, ctx), 0),
        Holding::Lender { mut receipts } => {
            let rate = mock_yield::exchange_rate(vault, clock);
            // receipts needed to cover principal, rounded UP so the user is never short
            let scale = mock_yield::rate_scale();
            let needed = (((principal as u128) * scale + rate - 1) / rate) as u64;
            let held = receipts.value();
            if (needed >= held) {
                (mock_yield::redeem(vault, coin::from_balance(receipts, ctx), clock, ctx), 0)
            } else {
                let keep = receipts.split(needed);
                let forfeit = receipts.value();
                pool.receipts.join(receipts);
                (mock_yield::redeem(vault, coin::from_balance(keep, ctx), clock, ctx), forfeit)
            }
        },
    };
    event::emit(LockBroken { lock_id, owner, returned: out.value(), forfeited_receipts: forfeited });
    out
}

// ---- views (for previews: "you get back $X, you give up $Y") ----

public fun principal<T>(l: &SavingsLock<T>): u64 { l.principal }
public fun unlock_ms<T>(l: &SavingsLock<T>): u64 { l.unlock_ms }
public fun breakable<T>(l: &SavingsLock<T>): bool { l.breakable }
public fun is_halal<T>(l: &SavingsLock<T>): bool { match (&l.holding) { Holding::Halal { .. } => true, Holding::Lender { .. } => false } }
public fun durations_ms(cfg: &SavingsConfig): vector<u64> { cfg.durations_ms }
public fun bonus_pool_receipts(pool: &BonusPool): u64 { pool.receipts.value() }
