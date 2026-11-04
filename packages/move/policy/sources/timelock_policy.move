/// Umbra — timelocked UpgradeCap custody.
///
/// Wraps a `sui::package::UpgradeCap` so an upgrade must go
/// propose -> wait `delay_ms` -> authorize -> commit. `propose` emits the
/// digest on-chain, giving users the full delay to inspect it before the
/// upgrade can land. Whoever holds `TimelockCap` controls upgrades, so hold it
/// in a multisig before mainnet.
module umbra_policy::timelock_policy;

use sui::clock::Clock;
use sui::event;
use sui::package::{Self, UpgradeCap, UpgradeTicket, UpgradeReceipt};

/// Delay below the minimum.
const EDelayTooShort: u64 = 0;
/// A proposal is already pending (cancel it first).
const EProposalPending: u64 = 1;
/// No proposal is pending.
const ENoProposal: u64 = 2;
/// Digest does not match the pending proposal.
const EDigestMismatch: u64 = 3;
/// The timelock has not elapsed yet.
const ETooEarly: u64 = 4;

/// Minimum allowed delay: 1 hour.
const MIN_DELAY_MS: u64 = 3_600_000;

public struct TimelockCap has key, store {
    id: UID,
    upgrade_cap: UpgradeCap,
    delay_ms: u64,
    pending: Option<Proposal>,
}

public struct Proposal has copy, drop, store {
    digest: vector<u8>,
    policy: u8,
    ready_at_ms: u64,
}

public struct UpgradeProposed has copy, drop {
    timelock_id: ID,
    package: ID,
    digest: vector<u8>,
    policy: u8,
    ready_at_ms: u64,
}

public struct UpgradeCancelled has copy, drop {
    timelock_id: ID,
    digest: vector<u8>,
}

public struct UpgradeAuthorized has copy, drop {
    timelock_id: ID,
    digest: vector<u8>,
}

public struct UpgradeCommitted has copy, drop {
    timelock_id: ID,
    package: ID,
    version: u64,
}

/// Lock `upgrade_cap` behind a `delay_ms` timelock.
public fun new(upgrade_cap: UpgradeCap, delay_ms: u64, ctx: &mut TxContext): TimelockCap {
    assert!(delay_ms >= MIN_DELAY_MS, EDelayTooShort);
    TimelockCap { id: object::new(ctx), upgrade_cap, delay_ms, pending: option::none() }
}

/// Announce an upgrade `digest`; it can be authorized after `delay_ms`.
public fun propose(
    tl: &mut TimelockCap,
    digest: vector<u8>,
    policy: u8,
    clock: &Clock,
) {
    assert!(tl.pending.is_none(), EProposalPending);
    let ready_at_ms = clock.timestamp_ms() + tl.delay_ms;
    tl.pending.fill(Proposal { digest, policy, ready_at_ms });
    event::emit(UpgradeProposed {
        timelock_id: object::id(tl),
        package: tl.upgrade_cap.upgrade_package(),
        digest,
        policy,
        ready_at_ms,
    });
}

public fun cancel(tl: &mut TimelockCap) {
    assert!(tl.pending.is_some(), ENoProposal);
    let p = tl.pending.extract();
    event::emit(UpgradeCancelled { timelock_id: object::id(tl), digest: p.digest });
}

/// After the delay, turn the pending proposal into an `UpgradeTicket`.
/// `digest` must match what was proposed.
public fun authorize(tl: &mut TimelockCap, digest: vector<u8>, clock: &Clock): UpgradeTicket {
    assert!(tl.pending.is_some(), ENoProposal);
    let p = *tl.pending.borrow();
    assert!(p.digest == digest, EDigestMismatch);
    assert!(clock.timestamp_ms() >= p.ready_at_ms, ETooEarly);
    tl.pending = option::none();
    event::emit(UpgradeAuthorized { timelock_id: object::id(tl), digest });
    package::authorize_upgrade(&mut tl.upgrade_cap, p.policy, digest)
}

public fun commit(tl: &mut TimelockCap, receipt: UpgradeReceipt) {
    package::commit_upgrade(&mut tl.upgrade_cap, receipt);
    event::emit(UpgradeCommitted {
        timelock_id: object::id(tl),
        package: tl.upgrade_cap.upgrade_package(),
        version: tl.upgrade_cap.version(),
    });
}

/// Irreversibly restrict future upgrades to additive changes only.
public fun only_additive_upgrades(tl: &mut TimelockCap) {
    package::only_additive_upgrades(&mut tl.upgrade_cap);
}

/// Irreversibly restrict future upgrades to dependency changes only.
public fun only_dep_upgrades(tl: &mut TimelockCap) {
    package::only_dep_upgrades(&mut tl.upgrade_cap);
}

// ---- views -----------------------------------------------------------------

public fun delay_ms(tl: &TimelockCap): u64 { tl.delay_ms }

public fun pending(tl: &TimelockCap): Option<Proposal> { tl.pending }

public fun upgrade_policy(tl: &TimelockCap): u8 { tl.upgrade_cap.upgrade_policy() }

public fun package_id(tl: &TimelockCap): ID { tl.upgrade_cap.upgrade_package() }

public fun min_delay_ms(): u64 { MIN_DELAY_MS }
