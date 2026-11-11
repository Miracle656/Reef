#[test_only]
module umbra_policy::timelock_policy_tests;

use sui::clock::{Self, Clock};
use sui::package;
use sui::test_scenario as ts;
use umbra_policy::timelock_policy::{Self, TimelockCap};

const ADMIN: address = @0xAD;
const DIGEST: vector<u8> = b"0123456789abcdef0123456789abcdef";

fun setup(sc: &mut ts::Scenario): (TimelockCap, Clock) {
    let cap = package::test_publish(object::id_from_address(@0x42), sc.ctx());
    let tl = timelock_policy::new(cap, timelock_policy::min_delay_ms(), sc.ctx());
    (tl, clock::create_for_testing(sc.ctx()))
}

fun teardown(sc: ts::Scenario, tl: TimelockCap, clk: Clock) {
    transfer::public_transfer(tl, ADMIN);
    clk.destroy_for_testing();
    sc.end();
}

#[test]
fun propose_wait_authorize_commit() {
    let mut sc = ts::begin(ADMIN);
    let (mut tl, mut clk) = setup(&mut sc);
    tl.propose(DIGEST, package::compatible_policy(), &clk);
    clk.increment_for_testing(timelock_policy::min_delay_ms());
    let ticket = tl.authorize(DIGEST, &clk);
    let receipt = package::test_upgrade(ticket);
    tl.commit(receipt);
    assert!(tl.pending().is_none(), 0);
    teardown(sc, tl, clk);
}

#[test]
#[expected_failure(abort_code = umbra_policy::timelock_policy::ETooEarly)]
fun authorize_before_delay_aborts() {
    let mut sc = ts::begin(ADMIN);
    let (mut tl, mut clk) = setup(&mut sc);
    tl.propose(DIGEST, package::compatible_policy(), &clk);
    clk.increment_for_testing(timelock_policy::min_delay_ms() - 1);
    let ticket = tl.authorize(DIGEST, &clk);
    tl.commit(package::test_upgrade(ticket));
    teardown(sc, tl, clk);
}

#[test]
#[expected_failure(abort_code = umbra_policy::timelock_policy::EDigestMismatch)]
fun authorize_other_digest_aborts() {
    let mut sc = ts::begin(ADMIN);
    let (mut tl, mut clk) = setup(&mut sc);
    tl.propose(DIGEST, package::compatible_policy(), &clk);
    clk.increment_for_testing(timelock_policy::min_delay_ms());
    let ticket = tl.authorize(b"ffffffffffffffffffffffffffffffff", &clk);
    tl.commit(package::test_upgrade(ticket));
    teardown(sc, tl, clk);
}

#[test]
#[expected_failure(abort_code = umbra_policy::timelock_policy::ENoProposal)]
fun authorize_after_cancel_aborts() {
    let mut sc = ts::begin(ADMIN);
    let (mut tl, mut clk) = setup(&mut sc);
    tl.propose(DIGEST, package::compatible_policy(), &clk);
    tl.cancel();
    clk.increment_for_testing(timelock_policy::min_delay_ms());
    let ticket = tl.authorize(DIGEST, &clk);
    tl.commit(package::test_upgrade(ticket));
    teardown(sc, tl, clk);
}

#[test]
#[expected_failure(abort_code = umbra_policy::timelock_policy::EProposalPending)]
fun double_propose_aborts() {
    let mut sc = ts::begin(ADMIN);
    let (mut tl, clk) = setup(&mut sc);
    tl.propose(DIGEST, package::compatible_policy(), &clk);
    tl.propose(DIGEST, package::compatible_policy(), &clk);
    teardown(sc, tl, clk);
}

#[test]
#[expected_failure(abort_code = umbra_policy::timelock_policy::EDelayTooShort)]
fun short_delay_aborts() {
    let mut sc = ts::begin(ADMIN);
    let cap = package::test_publish(object::id_from_address(@0x42), sc.ctx());
    let tl = timelock_policy::new(cap, 1, sc.ctx());
    transfer::public_transfer(tl, ADMIN);
    sc.end();
}

#[test]
fun only_additive_tightens_policy() {
    let mut sc = ts::begin(ADMIN);
    let (mut tl, clk) = setup(&mut sc);
    tl.only_additive_upgrades();
    assert!(tl.upgrade_policy() == package::additive_policy(), 0);
    teardown(sc, tl, clk);
}
