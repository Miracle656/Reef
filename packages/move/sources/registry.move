/// Umbra — global Registry.
///
/// A single SHARED object that enforces two app-level invariants:
///   1. one Profile per address      (`profiles`: address -> profile ID)
///   2. globally unique handles       (`handles`: normalized handle -> owner)
///
/// Only the `profile` module (same package) mutates the registry, via
/// `public(package)` functions. The registry is touched ONLY on profile
/// create / handle-change — both low-frequency operations — so the
/// serialization cost of a shared object is acceptable here. The hot paths
/// (posting, following) never touch this object, keeping them fully parallel.
module umbra::registry;

use std::string::String;
use sui::table::{Self, Table};

/// Handle already claimed by someone else.
const EHandleTaken: u64 = 0;
/// This address already owns a profile.
const EProfileExists: u64 = 1;
/// Caller does not own the handle being changed.
const ENotOwner: u64 = 2;
/// Old handle is not registered.
const EHandleNotOwned: u64 = 3;

public struct Registry has key {
    id: UID,
    /// normalized (lowercase) handle -> owning address
    handles: Table<String, address>,
    /// owner address -> their Profile object ID
    profiles: Table<address, ID>,
}

fun init(ctx: &mut TxContext) {
    transfer::share_object(Registry {
        id: object::new(ctx),
        handles: table::new(ctx),
        profiles: table::new(ctx),
    });
}

/// Claim `handle` for `owner` and bind `owner` to `profile_id`.
/// Aborts if the address already has a profile or the handle is taken.
public(package) fun register(
    reg: &mut Registry,
    handle: String,
    owner: address,
    profile_id: ID,
) {
    assert!(!reg.profiles.contains(owner), EProfileExists);
    assert!(!reg.handles.contains(handle), EHandleTaken);
    reg.handles.add(handle, owner);
    reg.profiles.add(owner, profile_id);
}

/// Move `owner`'s claim from `old_handle` to `new_handle`.
public(package) fun change_handle(
    reg: &mut Registry,
    old_handle: String,
    new_handle: String,
    owner: address,
) {
    assert!(reg.handles.contains(old_handle), EHandleNotOwned);
    assert!(*reg.handles.borrow(old_handle) == owner, ENotOwner);
    assert!(!reg.handles.contains(new_handle), EHandleTaken);
    reg.handles.remove(old_handle);
    reg.handles.add(new_handle, owner);
}

// ---- read-only views (handy for clients / sanity checks) -------------------

public fun has_profile(reg: &Registry, owner: address): bool {
    reg.profiles.contains(owner)
}

public fun handle_taken(reg: &Registry, handle: String): bool {
    reg.handles.contains(handle)
}

public fun profile_of(reg: &Registry, owner: address): ID {
    *reg.profiles.borrow(owner)
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(ctx)
}
