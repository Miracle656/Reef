/// Umbra — follow graph.
///
/// Each user owns one `FollowSet` object. Each edge (follower -> followee) is a
/// dynamic field on that set, keyed by the followee's address. This gives:
///   * O(1) duplicate-follow detection (`df::exists_`)
///   * fully PARALLEL follows/unfollows — a user only mutates their own set,
///     and we never read the followee's profile or any shared object on the
///     hot path.
///
/// The on-chain set is the source of truth for edges; the indexer builds the
/// queryable graph (followers/following, feed fan-out) off-chain from the
/// `Followed` / `Unfollowed` event stream. We never traverse the graph
/// on-chain.
module umbra::follow;

use sui::clock::Clock;
use sui::dynamic_field as df;
use sui::event;

/// Caller is not the owner of this FollowSet.
const ENotOwner: u64 = 0;
/// Cannot follow yourself.
const ESelfFollow: u64 = 1;
/// Already following this address.
const EAlreadyFollowing: u64 = 2;
/// Not currently following this address.
const ENotFollowing: u64 = 3;

public struct FollowSet has key {
    id: UID,
    owner: address,
    following_count: u64,
}

public struct Followed has copy, drop {
    follower: address,
    followee: address,
    created_at_ms: u64,
}

public struct Unfollowed has copy, drop {
    follower: address,
    followee: address,
}

/// Create the caller's FollowSet. Done once during onboarding — typically in
/// the same sponsored PTB as `create_profile`.
#[allow(lint(self_transfer))]
public fun create_follow_set(ctx: &mut TxContext) {
    let owner = ctx.sender();
    transfer::transfer(
        FollowSet { id: object::new(ctx), owner, following_count: 0 },
        owner,
    );
}

public fun follow(
    set: &mut FollowSet,
    followee: address,
    clock: &Clock,
    ctx: &TxContext,
) {
    assert!(set.owner == ctx.sender(), ENotOwner);
    assert!(followee != set.owner, ESelfFollow);
    assert!(!df::exists_(&set.id, followee), EAlreadyFollowing);

    let now = clock.timestamp_ms();
    df::add(&mut set.id, followee, now);
    set.following_count = set.following_count + 1;

    event::emit(Followed { follower: set.owner, followee, created_at_ms: now });
}

public fun unfollow(
    set: &mut FollowSet,
    followee: address,
    ctx: &TxContext,
) {
    assert!(set.owner == ctx.sender(), ENotOwner);
    assert!(df::exists_(&set.id, followee), ENotFollowing);

    let _ts: u64 = df::remove(&mut set.id, followee);
    set.following_count = set.following_count - 1;

    event::emit(Unfollowed { follower: set.owner, followee });
}

// ---- read-only accessors ---------------------------------------------------

public fun owner(set: &FollowSet): address { set.owner }
public fun following_count(set: &FollowSet): u64 { set.following_count }
public fun is_following(set: &FollowSet, followee: address): bool {
    df::exists_(&set.id, followee)
}
