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
///
/// Live upgrades: the struct layout is frozen once published, so the schema
/// version lives in a `ConfigKey` dynamic field. Every write path calls
/// `assert_version`, so once `migrate` bumps the stored version, older package
/// versions that carry the gate abort. The admin cap ID lives in an `AdminKey`
/// dynamic field; the live v1 registry gets its cap via `bootstrap_admin`.
module umbra::registry;

use std::string::String;
use sui::dynamic_field as df;
use sui::table::{Self, Table};

/// Handle already claimed by someone else.
const EHandleTaken: u64 = 0;
/// This address already owns a profile.
const EProfileExists: u64 = 1;
/// Caller does not own the handle being changed.
const ENotOwner: u64 = 2;
/// Old handle is not registered.
const EHandleNotOwned: u64 = 3;
/// Registry schema version does not match this package (call `migrate`).
const EWrongVersion: u64 = 4;
/// Admin cap does not belong to this registry.
const ENotAdmin: u64 = 5;
/// Registry already has an admin cap.
const EAdminExists: u64 = 6;
/// Sender is not the bootstrap address.
const ENotBootstrap: u64 = 7;
/// Registry is already at (or past) this package's version.
const EAlreadyMigrated: u64 = 8;

/// Schema version this package expects. Bump on every upgrade that must cut
/// off older package versions, then run `migrate`.
const VERSION: u64 = 2;

/// Testnet publisher; the only address allowed to `bootstrap_admin` the live
/// v1 registry (which was published before the admin cap existed).
const BOOTSTRAP_ADMIN: address =
    @0x669fbc7dff33e6af17cd1ce556e39b791c065ffc0ea653363e69363813f6ec58;

public struct Registry has key {
    id: UID,
    /// normalized (lowercase) handle -> owning address
    handles: Table<String, address>,
    /// owner address -> their Profile object ID
    profiles: Table<address, ID>,
}

/// Authorizes `migrate`. Hold in a multisig before mainnet.
public struct RegistryAdminCap has key, store {
    id: UID,
    registry_id: ID,
}

/// Dynamic-field key -> `u64` schema version.
public struct ConfigKey has copy, drop, store {}
/// Dynamic-field key -> `ID` of the registry's `RegistryAdminCap`.
public struct AdminKey has copy, drop, store {}

public struct RegistryMigrated has copy, drop {
    registry_id: ID,
    from_version: u64,
    to_version: u64,
}

fun init(ctx: &mut TxContext) {
    let mut reg = Registry {
        id: object::new(ctx),
        handles: table::new(ctx),
        profiles: table::new(ctx),
    };
    df::add(&mut reg.id, ConfigKey {}, VERSION);
    let cap = new_admin_cap(&mut reg, ctx);
    transfer::public_transfer(cap, ctx.sender());
    transfer::share_object(reg);
}

fun new_admin_cap(reg: &mut Registry, ctx: &mut TxContext): RegistryAdminCap {
    let cap = RegistryAdminCap { id: object::new(ctx), registry_id: object::id(reg) };
    df::add(&mut reg.id, AdminKey {}, object::id(&cap));
    cap
}

/// One-time: mint the admin cap for a registry published without one (the
/// live v1 testnet registry). Only the publisher address may call it.
public fun bootstrap_admin(reg: &mut Registry, ctx: &mut TxContext): RegistryAdminCap {
    assert!(ctx.sender() == BOOTSTRAP_ADMIN, ENotBootstrap);
    assert!(!df::exists_(&reg.id, AdminKey {}), EAdminExists);
    new_admin_cap(reg, ctx)
}

/// Cut the registry over to this package's `VERSION`. After this, write
/// paths in older package versions that check the version abort.
public fun migrate(reg: &mut Registry, cap: &RegistryAdminCap, _ctx: &TxContext) {
    assert!(cap.registry_id == object::id(reg), ENotAdmin);
    assert!(admin_cap_id(reg) == option::some(object::id(cap)), ENotAdmin);
    let from = version(reg);
    assert!(from < VERSION, EAlreadyMigrated);
    if (df::exists_(&reg.id, ConfigKey {})) {
        *df::borrow_mut<ConfigKey, u64>(&mut reg.id, ConfigKey {}) = VERSION;
    } else {
        df::add(&mut reg.id, ConfigKey {}, VERSION);
    };
    sui::event::emit(RegistryMigrated {
        registry_id: object::id(reg),
        from_version: from,
        to_version: VERSION,
    });
}

/// Abort unless the registry is at exactly this package's `VERSION`.
public(package) fun assert_version(reg: &Registry) {
    assert!(version(reg) == VERSION, EWrongVersion);
}

/// Claim `handle` for `owner` and bind `owner` to `profile_id`.
/// Aborts if the address already has a profile or the handle is taken.
public(package) fun register(
    reg: &mut Registry,
    handle: String,
    owner: address,
    profile_id: ID,
) {
    assert_version(reg);
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
    assert_version(reg);
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

/// Stored schema version; `1` for a registry that predates the version field.
public fun version(reg: &Registry): u64 {
    if (df::exists_(&reg.id, ConfigKey {})) *df::borrow(&reg.id, ConfigKey {})
    else 1
}

public fun admin_cap_id(reg: &Registry): Option<ID> {
    if (df::exists_(&reg.id, AdminKey {})) option::some(*df::borrow(&reg.id, AdminKey {}))
    else option::none()
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(ctx)
}

/// Shares a registry shaped like the live v1 one: no version, no admin cap.
#[test_only]
public fun init_legacy_for_testing(ctx: &mut TxContext) {
    transfer::share_object(Registry {
        id: object::new(ctx),
        handles: table::new(ctx),
        profiles: table::new(ctx),
    });
}

#[test_only]
public fun bootstrap_admin_address(): address { BOOTSTRAP_ADMIN }
