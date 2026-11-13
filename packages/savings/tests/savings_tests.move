#[test_only, allow(deprecated_usage)]
module reef_savings::savings_tests;

use reef_savings::mock_yield::{Self, AdminCap, MockVault, ReceiptMint, MOCK_YIELD};
use reef_savings::savings::{Self, BonusPool, SavingsConfig, SavingsLock};
use sui::clock::{Self, Clock};
use sui::coin::{Self, Coin};
use sui::test_scenario::{Self as ts, Scenario};

/// stand-in for USDC
public struct USDC has drop {}
/// some other coin
public struct NOT_USDC has drop {}

const ADMIN: address = @0xA;
const ALICE: address = @0xA11CE;
const MONTH: u64 = 30 * 24 * 60 * 60 * 1000;
const YEAR: u64 = 365 * 24 * 60 * 60 * 1000;
const USD: u64 = 1_000_000; // 6 decimals

/// Publish, create a 10% APR vault for USDC, freeze config (1/3/6/12 months).
fun setup(): (Scenario, Clock) {
    let mut sc = ts::begin(ADMIN);
    mock_yield::init_for_testing(sc.ctx());
    sc.next_tx(ADMIN);
    let clock = clock::create_for_testing(sc.ctx());
    {
        let cap = sc.take_from_sender<AdminCap>();
        let mint = sc.take_from_sender<ReceiptMint>();
        mock_yield::create_vault<USDC>(&cap, mint, 1_000, &clock, sc.ctx());
        savings::create_config<USDC>(&cap, vector[MONTH, 3 * MONTH, 6 * MONTH, 12 * MONTH], sc.ctx());
        sc.return_to_sender(cap);
    };
    sc.next_tx(ADMIN);
    // fund the yield so redemptions above principal can be paid
    {
        let mut vault = sc.take_shared<MockVault<USDC>>();
        mock_yield::top_up(&mut vault, coin::mint_for_testing<USDC>(1_000 * USD, sc.ctx()));
        ts::return_shared(vault);
    };
    (sc, clock)
}

fun usdc(sc: &mut Scenario, amount: u64): Coin<USDC> { coin::mint_for_testing<USDC>(amount, sc.ctx()) }

#[test]
fun rate_rises_with_time_and_flex_earns() {
    let (mut sc, mut clock) = setup();
    sc.next_tx(ALICE);
    let cfg = sc.take_immutable<SavingsConfig>();
    let mut vault = sc.take_shared<MockVault<USDC>>();
    let c = usdc(&mut sc, 100 * USD);
    let receipt = savings::deposit_flex(&cfg, &mut vault, c, &clock, sc.ctx());
    assert!(receipt.value() == 100 * USD); // rate starts at 1.0

    let r0 = mock_yield::exchange_rate(&vault, &clock);
    clock.increment_for_testing(YEAR);
    assert!(mock_yield::exchange_rate(&vault, &clock) > r0);

    let out = savings::withdraw_flex(&cfg, &mut vault, receipt, &clock, sc.ctx());
    assert!(out.value() == 110 * USD); // 10% APR for a year
    out.burn_for_testing();
    ts::return_immutable(cfg);
    ts::return_shared(vault);
    clock.destroy_for_testing();
    sc.end();
}

#[test]
fun lock_pays_principal_plus_yield_at_maturity() {
    let (mut sc, mut clock) = setup();
    sc.next_tx(ALICE);
    {
        let cfg = sc.take_immutable<SavingsConfig>();
        let mut vault = sc.take_shared<MockVault<USDC>>();
        let c = usdc(&mut sc, 100 * USD);
        savings::open_lock(&cfg, &mut vault, c, 12 * MONTH, true, &clock, sc.ctx());
        ts::return_immutable(cfg);
        ts::return_shared(vault);
    };
    clock.increment_for_testing(12 * MONTH);
    sc.next_tx(ALICE);
    {
        let cfg = sc.take_immutable<SavingsConfig>();
        let mut vault = sc.take_shared<MockVault<USDC>>();
        let lock = sc.take_from_sender<SavingsLock<USDC>>();
        assert!(savings::principal(&lock) == 100 * USD);
        let out = savings::withdraw_matured(&cfg, lock, &mut vault, &clock, sc.ctx());
        assert!(out.value() > 100 * USD); // earned something
        out.burn_for_testing();
        ts::return_immutable(cfg);
        ts::return_shared(vault);
    };
    clock.destroy_for_testing();
    sc.end();
}

#[test, expected_failure(abort_code = savings::ENotMatured)]
fun cannot_withdraw_before_maturity() {
    let (mut sc, mut clock) = setup();
    sc.next_tx(ALICE);
    {
        let cfg = sc.take_immutable<SavingsConfig>();
        let mut vault = sc.take_shared<MockVault<USDC>>();
        let c = usdc(&mut sc, 100 * USD);
        savings::open_lock(&cfg, &mut vault, c, 3 * MONTH, true, &clock, sc.ctx());
        ts::return_immutable(cfg);
        ts::return_shared(vault);
    };
    clock.increment_for_testing(MONTH);
    sc.next_tx(ALICE);
    let cfg = sc.take_immutable<SavingsConfig>();
    let mut vault = sc.take_shared<MockVault<USDC>>();
    let lock = sc.take_from_sender<SavingsLock<USDC>>();
    let out = savings::withdraw_matured(&cfg, lock, &mut vault, &clock, sc.ctx());
    out.burn_for_testing();
    abort 99
}

#[test]
fun break_early_returns_principal_and_forfeits_yield_to_the_pool() {
    let (mut sc, mut clock) = setup();
    sc.next_tx(ALICE);
    {
        let cfg = sc.take_immutable<SavingsConfig>();
        let mut vault = sc.take_shared<MockVault<USDC>>();
        let c = usdc(&mut sc, 100 * USD);
        savings::open_lock(&cfg, &mut vault, c, 12 * MONTH, true, &clock, sc.ctx());
        ts::return_immutable(cfg);
        ts::return_shared(vault);
    };
    clock.increment_for_testing(6 * MONTH);
    sc.next_tx(ALICE);
    {
        let cfg = sc.take_immutable<SavingsConfig>();
        let mut vault = sc.take_shared<MockVault<USDC>>();
        let mut pool = sc.take_shared<BonusPool>();
        let lock = sc.take_from_sender<SavingsLock<USDC>>();
        let out = savings::break_early(&cfg, lock, &mut vault, &mut pool, &clock, sc.ctx());
        assert!(out.value() == 100 * USD); // principal, exactly
        assert!(savings::bonus_pool_receipts(&pool) > 0); // the yield went to the pool
        out.burn_for_testing();
        ts::return_immutable(cfg);
        ts::return_shared(vault);
        ts::return_shared(pool);
    };
    clock.destroy_for_testing();
    sc.end();
}

#[test]
fun break_early_after_a_rate_drop_returns_everything_without_aborting() {
    let (mut sc, mut clock) = setup();
    sc.next_tx(ALICE);
    {
        let cfg = sc.take_immutable<SavingsConfig>();
        let mut vault = sc.take_shared<MockVault<USDC>>();
        let c = usdc(&mut sc, 100 * USD);
        savings::open_lock(&cfg, &mut vault, c, 12 * MONTH, true, &clock, sc.ctx());
        ts::return_immutable(cfg);
        ts::return_shared(vault);
    };
    sc.next_tx(ADMIN);
    {
        let cap = sc.take_from_sender<AdminCap>();
        let mut vault = sc.take_shared<MockVault<USDC>>();
        mock_yield::haircut(&cap, &mut vault, 2_000, &clock); // lender loses 20%
        sc.return_to_sender(cap);
        ts::return_shared(vault);
    };
    clock.increment_for_testing(MONTH);
    sc.next_tx(ALICE);
    {
        let cfg = sc.take_immutable<SavingsConfig>();
        let mut vault = sc.take_shared<MockVault<USDC>>();
        let mut pool = sc.take_shared<BonusPool>();
        let lock = sc.take_from_sender<SavingsLock<USDC>>();
        let out = savings::break_early(&cfg, lock, &mut vault, &mut pool, &clock, sc.ctx());
        assert!(out.value() < 100 * USD && out.value() > 80 * USD); // all that's left
        assert!(savings::bonus_pool_receipts(&pool) == 0); // nothing forfeited
        out.burn_for_testing();
        ts::return_immutable(cfg);
        ts::return_shared(vault);
        ts::return_shared(pool);
    };
    clock.destroy_for_testing();
    sc.end();
}

#[test, expected_failure(abort_code = savings::EUnbreakable)]
fun unbreakable_lock_cannot_break_early() {
    let (mut sc, clock) = setup();
    sc.next_tx(ALICE);
    {
        let cfg = sc.take_immutable<SavingsConfig>();
        let mut vault = sc.take_shared<MockVault<USDC>>();
        let c = usdc(&mut sc, 100 * USD);
        savings::open_lock(&cfg, &mut vault, c, 6 * MONTH, false, &clock, sc.ctx());
        ts::return_immutable(cfg);
        ts::return_shared(vault);
    };
    sc.next_tx(ALICE);
    let cfg = sc.take_immutable<SavingsConfig>();
    let mut vault = sc.take_shared<MockVault<USDC>>();
    let mut pool = sc.take_shared<BonusPool>();
    let lock = sc.take_from_sender<SavingsLock<USDC>>();
    let out = savings::break_early(&cfg, lock, &mut vault, &mut pool, &clock, sc.ctx());
    out.burn_for_testing();
    abort 99
}

#[test, expected_failure(abort_code = savings::EWrongCoin)]
fun rejects_a_coin_that_isnt_usdc() {
    let (mut sc, clock) = setup();
    sc.next_tx(ALICE);
    let cfg = sc.take_immutable<SavingsConfig>();
    let c = coin::mint_for_testing<NOT_USDC>(100 * USD, sc.ctx());
    savings::open_halal_lock(&cfg, c, MONTH, true, &clock, sc.ctx());
    abort 99
}

#[test, expected_failure(abort_code = savings::EBadDuration)]
fun rejects_an_unlisted_duration() {
    let (mut sc, clock) = setup();
    sc.next_tx(ALICE);
    let cfg = sc.take_immutable<SavingsConfig>();
    let mut vault = sc.take_shared<MockVault<USDC>>();
    let c = usdc(&mut sc, 100 * USD);
    savings::open_lock(&cfg, &mut vault, c, 2 * MONTH, true, &clock, sc.ctx());
    abort 99
}

#[test]
fun halal_lock_is_zero_percent_and_never_touches_the_lender() {
    let (mut sc, mut clock) = setup();
    sc.next_tx(ALICE);
    let supply_before;
    {
        let cfg = sc.take_immutable<SavingsConfig>();
        let vault = sc.take_shared<MockVault<USDC>>();
        supply_before = mock_yield::receipt_supply(&vault);
        let c = usdc(&mut sc, 50 * USD);
        savings::open_halal_lock(&cfg, c, 3 * MONTH, true, &clock, sc.ctx());
        assert!(mock_yield::receipt_supply(&vault) == supply_before);
        ts::return_immutable(cfg);
        ts::return_shared(vault);
    };
    clock.increment_for_testing(3 * MONTH);
    sc.next_tx(ALICE);
    {
        let cfg = sc.take_immutable<SavingsConfig>();
        let mut vault = sc.take_shared<MockVault<USDC>>();
        let lock = sc.take_from_sender<SavingsLock<USDC>>();
        assert!(savings::is_halal(&lock));
        let out = savings::withdraw_matured(&cfg, lock, &mut vault, &clock, sc.ctx());
        assert!(out.value() == 50 * USD); // exactly what went in
        out.burn_for_testing();
        ts::return_immutable(cfg);
        ts::return_shared(vault);
    };
    clock.destroy_for_testing();
    sc.end();
}

#[test, expected_failure(abort_code = mock_yield::ENotEnoughLiquidity)]
fun redeem_beyond_liquidity_aborts_like_a_fully_utilised_market() {
    let mut sc = ts::begin(ADMIN);
    mock_yield::init_for_testing(sc.ctx());
    sc.next_tx(ADMIN);
    let mut clock = clock::create_for_testing(sc.ctx());
    let cap = sc.take_from_sender<AdminCap>();
    let mint = sc.take_from_sender<ReceiptMint>();
    mock_yield::create_vault<USDC>(&cap, mint, 1_000, &clock, sc.ctx());
    sc.next_tx(ALICE);
    let mut vault = sc.take_shared<MockVault<USDC>>();
    let c = coin::mint_for_testing<USDC>(100 * USD, sc.ctx());
    let receipt: Coin<MOCK_YIELD> = mock_yield::deposit(&mut vault, c, &clock, sc.ctx());
    clock.increment_for_testing(YEAR); // yield accrued but never funded (no top_up)
    let out = mock_yield::redeem(&mut vault, receipt, &clock, sc.ctx());
    out.burn_for_testing();
    abort 99
}
