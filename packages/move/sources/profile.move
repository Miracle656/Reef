/// Umbra — user Profile.
///
/// A `Profile` is an OWNED object held by the user's (zkLogin) address. Owned
/// objects give us parallel execution: each user only ever mutates their own
/// profile, so profile updates never contend with each other. Global
/// uniqueness (one profile per address, unique handles) is delegated to the
/// shared `registry` object, which is touched only at creation / handle-change.
///
/// Handles are app-level (claimed in our `Registry`) so onboarding is instant
/// and gasless. `suins_name` is reserved for an optionally-linked real SuiNS
/// name (Phase 1.5+); see CLAUDE.md for the SuiNS decision.
module umbra::profile;

use std::string::{Self, String};
use sui::clock::Clock;
use sui::event;
use umbra::registry::{Self, Registry};

const MIN_HANDLE_LEN: u64 = 3;
const MAX_HANDLE_LEN: u64 = 20;
const MAX_DISPLAY_LEN: u64 = 50;
const MAX_BIO_LEN: u64 = 280;

/// Handle length out of [MIN_HANDLE_LEN, MAX_HANDLE_LEN].
const EHandleLen: u64 = 0;
/// Handle contains a character outside [a-z0-9_].
const EHandleChar: u64 = 1;
/// Display name too long.
const EDisplayLen: u64 = 2;
/// Bio too long.
const EBioLen: u64 = 3;
/// Caller is not the profile owner.
const ENotOwner: u64 = 4;

public struct Profile has key, store {
    id: UID,
    owner: address,
    /// normalized lowercase handle, also claimed in the Registry
    handle: String,
    display_name: String,
    bio: String,
    /// Walrus blob ID of the avatar image, if set
    avatar_blob_id: Option<String>,
    /// optionally-linked real SuiNS name (reserved for Phase 1.5+)
    suins_name: Option<String>,
    created_at_ms: u64,
    updated_at_ms: u64,
}

public struct ProfileCreated has copy, drop {
    profile_id: ID,
    owner: address,
    handle: String,
    display_name: String,
    bio: String,
    avatar_blob_id: Option<String>,
    suins_name: Option<String>,
    created_at_ms: u64,
}

public struct ProfileUpdated has copy, drop {
    profile_id: ID,
    owner: address,
    handle: String,
    display_name: String,
    bio: String,
    avatar_blob_id: Option<String>,
    updated_at_ms: u64,
}

/// Create a profile owned by the transaction sender and claim the handle.
/// `avatar_blob_id` is an optional Walrus blob ID (raw utf8 bytes).
/// Self-transfer is intentional: onboarding mints the profile straight to the
/// new (zkLogin) owner inside a single sponsored transaction.
#[allow(lint(self_transfer))]
/// `suins_name` is the full auto-minted leaf subname (e.g. "alice.umbra.sui")
/// that the backend mints to this address during onboarding; pass
/// `option::none()` if the subname is linked later via `set_suins_name`.
public fun create_profile(
    reg: &mut Registry,
    handle: vector<u8>,
    display_name: vector<u8>,
    bio: vector<u8>,
    avatar_blob_id: Option<vector<u8>>,
    suins_name: Option<vector<u8>>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let h = validate_handle(handle);
    let dn = validate_display(display_name);
    let b = validate_bio(bio);
    let avatar = opt_string(avatar_blob_id);
    let suins = opt_string(suins_name);
    let now = clock.timestamp_ms();
    let owner = ctx.sender();

    let profile = Profile {
        id: object::new(ctx),
        owner,
        handle: clone(&h),
        display_name: clone(&dn),
        bio: clone(&b),
        avatar_blob_id: clone_opt(&avatar),
        suins_name: clone_opt(&suins),
        created_at_ms: now,
        updated_at_ms: now,
    };
    let profile_id = object::id(&profile);

    // claim uniqueness in the shared registry (aborts on dup handle / profile)
    registry::register(reg, h, owner, profile_id);

    event::emit(ProfileCreated {
        profile_id,
        owner,
        handle: clone(&profile.handle),
        display_name: dn,
        bio: b,
        avatar_blob_id: avatar,
        suins_name: suins,
        created_at_ms: now,
    });

    transfer::transfer(profile, owner);
}

/// Update mutable profile fields (display name, bio, avatar). Handle is changed
/// separately via `change_handle` because it touches the registry.
public fun update_profile(
    profile: &mut Profile,
    display_name: vector<u8>,
    bio: vector<u8>,
    avatar_blob_id: Option<vector<u8>>,
    clock: &Clock,
    ctx: &TxContext,
) {
    assert!(profile.owner == ctx.sender(), ENotOwner);
    profile.display_name = validate_display(display_name);
    profile.bio = validate_bio(bio);
    profile.avatar_blob_id = opt_string(avatar_blob_id);
    profile.updated_at_ms = clock.timestamp_ms();
    emit_updated(profile);
}

/// Change the handle, re-claiming uniqueness in the registry.
public fun change_handle(
    reg: &mut Registry,
    profile: &mut Profile,
    new_handle: vector<u8>,
    clock: &Clock,
    ctx: &TxContext,
) {
    assert!(profile.owner == ctx.sender(), ENotOwner);
    let nh = validate_handle(new_handle);
    registry::change_handle(reg, clone(&profile.handle), clone(&nh), profile.owner);
    profile.handle = nh;
    profile.updated_at_ms = clock.timestamp_ms();
    emit_updated(profile);
}

/// Link an already-owned SuiNS name to this profile (reserved for Phase 1.5+).
public fun set_suins_name(
    profile: &mut Profile,
    suins_name: vector<u8>,
    clock: &Clock,
    ctx: &TxContext,
) {
    assert!(profile.owner == ctx.sender(), ENotOwner);
    profile.suins_name = option::some(string::utf8(suins_name));
    profile.updated_at_ms = clock.timestamp_ms();
    emit_updated(profile);
}

fun emit_updated(profile: &Profile) {
    event::emit(ProfileUpdated {
        profile_id: object::id(profile),
        owner: profile.owner,
        handle: clone(&profile.handle),
        display_name: clone(&profile.display_name),
        bio: clone(&profile.bio),
        avatar_blob_id: clone_opt(&profile.avatar_blob_id),
        updated_at_ms: profile.updated_at_ms,
    });
}

// ---- validation helpers ----------------------------------------------------

/// Validate and normalize a handle to lowercase ASCII [a-z0-9_].
fun validate_handle(bytes: vector<u8>): String {
    let len = bytes.length();
    assert!(len >= MIN_HANDLE_LEN && len <= MAX_HANDLE_LEN, EHandleLen);
    let mut out: vector<u8> = vector[];
    let mut i = 0;
    while (i < len) {
        let c = *bytes.borrow(i);
        let lc = if (c >= 65 && c <= 90) { c + 32 } else { c }; // A-Z -> a-z
        let ok = (lc >= 97 && lc <= 122) || (lc >= 48 && lc <= 57) || lc == 95;
        assert!(ok, EHandleChar);
        out.push_back(lc);
        i = i + 1;
    };
    string::utf8(out)
}

fun validate_display(bytes: vector<u8>): String {
    let s = string::utf8(bytes);
    assert!(s.length() <= MAX_DISPLAY_LEN, EDisplayLen);
    s
}

fun validate_bio(bytes: vector<u8>): String {
    let s = string::utf8(bytes);
    assert!(s.length() <= MAX_BIO_LEN, EBioLen);
    s
}

fun opt_string(o: Option<vector<u8>>): Option<String> {
    if (o.is_some()) {
        option::some(string::utf8(o.destroy_some()))
    } else {
        o.destroy_none();
        option::none()
    }
}

fun clone(s: &String): String {
    string::utf8(*s.as_bytes())
}

fun clone_opt(o: &Option<String>): Option<String> {
    if (o.is_some()) option::some(clone(o.borrow())) else option::none()
}

// ---- read-only accessors ---------------------------------------------------

public fun owner(p: &Profile): address { p.owner }
public fun handle(p: &Profile): String { clone(&p.handle) }
public fun display_name(p: &Profile): String { clone(&p.display_name) }
public fun bio(p: &Profile): String { clone(&p.bio) }
public fun avatar_blob_id(p: &Profile): Option<String> { clone_opt(&p.avatar_blob_id) }
public fun suins_name(p: &Profile): Option<String> { clone_opt(&p.suins_name) }
public fun created_at_ms(p: &Profile): u64 { p.created_at_ms }
public fun updated_at_ms(p: &Profile): u64 { p.updated_at_ms }
