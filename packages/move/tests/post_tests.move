#[test_only]
module umbra::post_tests;

use std::string;
use sui::clock;
use sui::test_scenario as ts;
use umbra::post::{Self, Post};

const ALICE: address = @0xA;

#[test]
fun create_text_and_media_post() {
    let mut sc = ts::begin(ALICE);
    {
        let clk = clock::create_for_testing(sc.ctx());
        post::create_post(
            b"gm Lagos",
            vector[b"blob-img-1", b"blob-img-2"],
            option::none(),
            &clk,
            sc.ctx(),
        );
        clk.destroy_for_testing();
    };
    sc.next_tx(ALICE);
    {
        let p = sc.take_from_sender<Post>();
        assert!(p.author() == ALICE, 0);
        assert!(p.text() == string::utf8(b"gm Lagos"), 1);
        assert!(p.media().length() == 2, 2);
        assert!(p.reply_to() == option::none(), 3);
        sc.return_to_sender(p);
    };
    sc.end();
}

#[test]
fun reply_carries_parent_id() {
    let mut sc = ts::begin(ALICE);
    {
        let clk = clock::create_for_testing(sc.ctx());
        post::create_post(b"parent", vector[], option::none(), &clk, sc.ctx());
        clk.destroy_for_testing();
    };
    sc.next_tx(ALICE);
    let parent_id = {
        let parent = sc.take_from_sender<Post>();
        let id = object::id(&parent);
        sc.return_to_sender(parent);
        id
    };
    {
        let clk = clock::create_for_testing(sc.ctx());
        post::create_post(b"reply", vector[], option::some(parent_id), &clk, sc.ctx());
        clk.destroy_for_testing();
    };
    sc.next_tx(ALICE);
    {
        // hold the parent aside (by id) so the remaining object is the reply
        let parent = sc.take_from_sender_by_id<Post>(parent_id);
        let reply = sc.take_from_sender<Post>();
        assert!(reply.reply_to() == option::some(parent_id), 0);
        sc.return_to_sender(reply);
        sc.return_to_sender(parent);
    };
    sc.end();
}

#[test]
fun media_only_post_ok() {
    let mut sc = ts::begin(ALICE);
    let clk = clock::create_for_testing(sc.ctx());
    post::create_post(b"", vector[b"blob-1"], option::none(), &clk, sc.ctx());
    clk.destroy_for_testing();
    sc.end();
}

#[test]
#[expected_failure(abort_code = umbra::post::EEmpty)]
fun empty_post_aborts() {
    let mut sc = ts::begin(ALICE);
    let clk = clock::create_for_testing(sc.ctx());
    post::create_post(b"", vector[], option::none(), &clk, sc.ctx());
    clk.destroy_for_testing();
    sc.end();
}

#[test]
#[expected_failure(abort_code = umbra::post::ETooManyMedia)]
fun too_many_media_aborts() {
    let mut sc = ts::begin(ALICE);
    let clk = clock::create_for_testing(sc.ctx());
    post::create_post(
        b"x",
        vector[b"1", b"2", b"3", b"4", b"5"],
        option::none(),
        &clk,
        sc.ctx(),
    );
    clk.destroy_for_testing();
    sc.end();
}

#[test]
fun delete_post_ok() {
    let mut sc = ts::begin(ALICE);
    {
        let clk = clock::create_for_testing(sc.ctx());
        post::create_post(b"to delete", vector[], option::none(), &clk, sc.ctx());
        clk.destroy_for_testing();
    };
    sc.next_tx(ALICE);
    {
        let p = sc.take_from_sender<Post>();
        post::delete_post(p, sc.ctx());
    };
    sc.next_tx(ALICE);
    assert!(!ts::has_most_recent_for_sender<Post>(&sc), 0);
    sc.end();
}
