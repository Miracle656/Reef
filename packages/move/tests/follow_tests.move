#[test_only]
module umbra::follow_tests;

use sui::clock;
use sui::test_scenario as ts;
use umbra::follow::{Self, FollowSet};

const ALICE: address = @0xA;
const BOB: address = @0xB;
const CAROL: address = @0xC;

#[test]
fun follow_and_unfollow() {
    let mut sc = ts::begin(ALICE);
    follow::create_follow_set(sc.ctx());
    sc.next_tx(ALICE);
    {
        let mut set = sc.take_from_sender<FollowSet>();
        let clk = clock::create_for_testing(sc.ctx());
        follow::follow(&mut set, BOB, &clk, sc.ctx());
        follow::follow(&mut set, CAROL, &clk, sc.ctx());
        assert!(set.following_count() == 2, 0);
        assert!(set.is_following(BOB), 1);

        follow::unfollow(&mut set, BOB, sc.ctx());
        assert!(set.following_count() == 1, 2);
        assert!(!set.is_following(BOB), 3);

        clk.destroy_for_testing();
        sc.return_to_sender(set);
    };
    sc.end();
}

#[test]
#[expected_failure(abort_code = umbra::follow::EAlreadyFollowing)]
fun duplicate_follow_aborts() {
    let mut sc = ts::begin(ALICE);
    follow::create_follow_set(sc.ctx());
    sc.next_tx(ALICE);
    let mut set = sc.take_from_sender<FollowSet>();
    let clk = clock::create_for_testing(sc.ctx());
    follow::follow(&mut set, BOB, &clk, sc.ctx());
    follow::follow(&mut set, BOB, &clk, sc.ctx());
    clk.destroy_for_testing();
    sc.return_to_sender(set);
    sc.end();
}

#[test]
#[expected_failure(abort_code = umbra::follow::ESelfFollow)]
fun self_follow_aborts() {
    let mut sc = ts::begin(ALICE);
    follow::create_follow_set(sc.ctx());
    sc.next_tx(ALICE);
    let mut set = sc.take_from_sender<FollowSet>();
    let clk = clock::create_for_testing(sc.ctx());
    follow::follow(&mut set, ALICE, &clk, sc.ctx());
    clk.destroy_for_testing();
    sc.return_to_sender(set);
    sc.end();
}

#[test]
#[expected_failure(abort_code = umbra::follow::ENotFollowing)]
fun unfollow_unknown_aborts() {
    let mut sc = ts::begin(ALICE);
    follow::create_follow_set(sc.ctx());
    sc.next_tx(ALICE);
    let mut set = sc.take_from_sender<FollowSet>();
    follow::unfollow(&mut set, BOB, sc.ctx());
    sc.return_to_sender(set);
    sc.end();
}
