#[test_only]
module umbra::registry_tests;

use sui::clock;
use sui::test_scenario as ts;
use umbra::profile;
use umbra::registry::{Self, Registry, RegistryAdminCap};

const ALICE: address = @0xA;
const BOB: address = @0xB;

#[test]
fun fresh_registry_is_current_with_admin() {
    let mut sc = ts::begin(ALICE);
    registry::init_for_testing(sc.ctx());
    sc.next_tx(ALICE);
    {
        let reg = sc.take_shared<Registry>();
        let cap = sc.take_from_sender<RegistryAdminCap>();
        assert!(reg.version() == 2, 0);
        assert!(reg.admin_cap_id() == option::some(object::id(&cap)), 1);
        sc.return_to_sender(cap);
        ts::return_shared(reg);
    };
    sc.end();
}

#[test]
#[expected_failure(abort_code = umbra::registry::EWrongVersion)]
fun legacy_registry_rejects_writes_until_migrated() {
    let mut sc = ts::begin(ALICE);
    registry::init_legacy_for_testing(sc.ctx());
    sc.next_tx(ALICE);
    let mut reg = sc.take_shared<Registry>();
    let clk = clock::create_for_testing(sc.ctx());
    profile::create_profile(&mut reg, b"alice", b"A", b"", option::none(), option::none(), &clk, sc.ctx());
    clk.destroy_for_testing();
    ts::return_shared(reg);
    sc.end();
}

#[test]
fun bootstrap_then_migrate_legacy_registry() {
    let admin = registry::bootstrap_admin_address();
    let mut sc = ts::begin(admin);
    registry::init_legacy_for_testing(sc.ctx());
    sc.next_tx(admin);
    {
        let mut reg = sc.take_shared<Registry>();
        assert!(reg.version() == 1, 0);
        let cap = registry::bootstrap_admin(&mut reg, sc.ctx());
        registry::migrate(&mut reg, &cap, sc.ctx());
        assert!(reg.version() == 2, 1);
        let clk = clock::create_for_testing(sc.ctx());
        profile::create_profile(&mut reg, b"alice", b"A", b"", option::none(), option::none(), &clk, sc.ctx());
        clk.destroy_for_testing();
        transfer::public_transfer(cap, admin);
        ts::return_shared(reg);
    };
    sc.end();
}

#[test]
#[expected_failure(abort_code = umbra::registry::ENotBootstrap)]
fun bootstrap_by_stranger_aborts() {
    let mut sc = ts::begin(BOB);
    registry::init_legacy_for_testing(sc.ctx());
    sc.next_tx(BOB);
    let mut reg = sc.take_shared<Registry>();
    let cap = registry::bootstrap_admin(&mut reg, sc.ctx());
    transfer::public_transfer(cap, BOB);
    ts::return_shared(reg);
    sc.end();
}

#[test]
#[expected_failure(abort_code = umbra::registry::EAdminExists)]
fun second_bootstrap_aborts() {
    let admin = registry::bootstrap_admin_address();
    let mut sc = ts::begin(admin);
    registry::init_legacy_for_testing(sc.ctx());
    sc.next_tx(admin);
    let mut reg = sc.take_shared<Registry>();
    let c1 = registry::bootstrap_admin(&mut reg, sc.ctx());
    let c2 = registry::bootstrap_admin(&mut reg, sc.ctx());
    transfer::public_transfer(c1, admin);
    transfer::public_transfer(c2, admin);
    ts::return_shared(reg);
    sc.end();
}

#[test]
#[expected_failure(abort_code = umbra::registry::EAlreadyMigrated)]
fun migrate_current_registry_aborts() {
    let mut sc = ts::begin(ALICE);
    registry::init_for_testing(sc.ctx());
    sc.next_tx(ALICE);
    let mut reg = sc.take_shared<Registry>();
    let cap = sc.take_from_sender<RegistryAdminCap>();
    registry::migrate(&mut reg, &cap, sc.ctx());
    sc.return_to_sender(cap);
    ts::return_shared(reg);
    sc.end();
}

#[test]
#[expected_failure(abort_code = umbra::registry::ENotAdmin)]
fun migrate_with_foreign_cap_aborts() {
    let admin = registry::bootstrap_admin_address();
    let mut sc = ts::begin(admin);
    registry::init_legacy_for_testing(sc.ctx());
    registry::init_legacy_for_testing(sc.ctx());
    sc.next_tx(admin);
    let mut r1 = sc.take_shared<Registry>();
    let mut r2 = sc.take_shared<Registry>();
    let cap2 = registry::bootstrap_admin(&mut r2, sc.ctx());
    registry::migrate(&mut r1, &cap2, sc.ctx());
    transfer::public_transfer(cap2, admin);
    ts::return_shared(r1);
    ts::return_shared(r2);
    sc.end();
}
