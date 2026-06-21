#[test_only]
module umbra::profile_tests;

use std::string;
use sui::clock;
use sui::test_scenario as ts;
use umbra::profile::{Self, Profile};
use umbra::registry::{Self, Registry};

const ALICE: address = @0xA;
const BOB: address = @0xB;

fun setup(): ts::Scenario {
    let mut sc = ts::begin(ALICE);
    registry::init_for_testing(sc.ctx());
    sc
}

#[test]
fun create_and_read_profile() {
    let mut sc = setup();
    sc.next_tx(ALICE);
    {
        let mut reg = sc.take_shared<Registry>();
        let clk = clock::create_for_testing(sc.ctx());
        profile::create_profile(
            &mut reg,
            b"Alice", // mixed case -> normalized to "alice"
            b"Alice A",
            b"gm from Lagos",
            option::some(b"blob-avatar-1"),
            &clk,
            sc.ctx(),
        );
        assert!(reg.has_profile(ALICE), 0);
        assert!(reg.handle_taken(string::utf8(b"alice")), 1);
        clk.destroy_for_testing();
        ts::return_shared(reg);
    };
    // Alice owns the Profile object now
    sc.next_tx(ALICE);
    {
        let p = sc.take_from_sender<Profile>();
        assert!(p.owner() == ALICE, 2);
        assert!(p.handle() == string::utf8(b"alice"), 3);
        assert!(p.display_name() == string::utf8(b"Alice A"), 4);
        assert!(p.avatar_blob_id() == option::some(string::utf8(b"blob-avatar-1")), 5);
        sc.return_to_sender(p);
    };
    sc.end();
}

#[test]
#[expected_failure(abort_code = umbra::registry::EHandleTaken)]
fun duplicate_handle_aborts() {
    let mut sc = setup();
    sc.next_tx(ALICE);
    let mut reg = sc.take_shared<Registry>();
    let clk = clock::create_for_testing(sc.ctx());
    profile::create_profile(&mut reg, b"alice", b"A", b"", option::none(), &clk, sc.ctx());
    // BOB tries to claim the same handle
    sc.next_tx(BOB);
    profile::create_profile(&mut reg, b"Alice", b"B", b"", option::none(), &clk, sc.ctx());
    clk.destroy_for_testing();
    ts::return_shared(reg);
    sc.end();
}

#[test]
#[expected_failure(abort_code = umbra::registry::EProfileExists)]
fun two_profiles_same_address_aborts() {
    let mut sc = setup();
    sc.next_tx(ALICE);
    let mut reg = sc.take_shared<Registry>();
    let clk = clock::create_for_testing(sc.ctx());
    profile::create_profile(&mut reg, b"alice", b"A", b"", option::none(), &clk, sc.ctx());
    profile::create_profile(&mut reg, b"alice2", b"A", b"", option::none(), &clk, sc.ctx());
    clk.destroy_for_testing();
    ts::return_shared(reg);
    sc.end();
}

#[test]
#[expected_failure(abort_code = umbra::profile::EHandleChar)]
fun invalid_handle_char_aborts() {
    let mut sc = setup();
    sc.next_tx(ALICE);
    let mut reg = sc.take_shared<Registry>();
    let clk = clock::create_for_testing(sc.ctx());
    profile::create_profile(&mut reg, b"bad handle!", b"A", b"", option::none(), &clk, sc.ctx());
    clk.destroy_for_testing();
    ts::return_shared(reg);
    sc.end();
}

#[test]
fun update_and_change_handle() {
    let mut sc = setup();
    sc.next_tx(ALICE);
    {
        let mut reg = sc.take_shared<Registry>();
        let clk = clock::create_for_testing(sc.ctx());
        profile::create_profile(&mut reg, b"alice", b"A", b"old bio", option::none(), &clk, sc.ctx());
        clk.destroy_for_testing();
        ts::return_shared(reg);
    };
    sc.next_tx(ALICE);
    {
        let mut reg = sc.take_shared<Registry>();
        let mut p = sc.take_from_sender<Profile>();
        let clk = clock::create_for_testing(sc.ctx());
        profile::update_profile(&mut p, b"Alice New", b"new bio", option::some(b"blob-2"), &clk, sc.ctx());
        assert!(p.bio() == string::utf8(b"new bio"), 0);
        profile::change_handle(&mut reg, &mut p, b"alice_2", &clk, sc.ctx());
        assert!(p.handle() == string::utf8(b"alice_2"), 1);
        assert!(reg.handle_taken(string::utf8(b"alice_2")), 2);
        assert!(!reg.handle_taken(string::utf8(b"alice")), 3);
        clk.destroy_for_testing();
        sc.return_to_sender(p);
        ts::return_shared(reg);
    };
    sc.end();
}
