/// Umbra — Post.
///
/// A `Post` is an OWNED object held by its author. Creation never touches any
/// shared state, so posting is fully parallel across users. Threading (replies)
/// is by `reply_to` ID; the indexer reconstructs threads off-chain from the
/// `PostCreated` event stream rather than walking objects on-chain.
///
/// Likes / reposts are deliberately NOT modeled here — at scale, one owned
/// object per reaction is the state-bloat wall we are avoiding. Reactions are
/// off-chain signed messages aggregated by the indexer (see CLAUDE.md). The
/// object/event shape below is designed so reactions COULD be settled on-chain
/// later (stable `post_id`) without migrating posts.
module umbra::post;

use std::string::{Self, String};
use sui::clock::Clock;
use sui::event;

const MAX_TEXT_LEN: u64 = 560;
const MAX_MEDIA: u64 = 4;

/// Text exceeds MAX_TEXT_LEN.
const ETextLen: u64 = 0;
/// More than MAX_MEDIA blobs attached.
const ETooManyMedia: u64 = 1;
/// Post has neither text nor media.
const EEmpty: u64 = 2;
/// Caller is not the post author.
const ENotAuthor: u64 = 3;

public struct Post has key, store {
    id: UID,
    author: address,
    text: String,
    /// Walrus blob IDs for attached media (images/video), capped at MAX_MEDIA
    media: vector<String>,
    /// parent post ID if this is a reply
    reply_to: Option<ID>,
    created_at_ms: u64,
    /// equals created_at_ms until the post is edited
    updated_at_ms: u64,
}

public struct PostCreated has copy, drop {
    post_id: ID,
    author: address,
    text: String,
    media: vector<String>,
    reply_to: Option<ID>,
    created_at_ms: u64,
}

public struct PostEdited has copy, drop {
    post_id: ID,
    author: address,
    text: String,
    media: vector<String>,
    updated_at_ms: u64,
}

public struct PostDeleted has copy, drop {
    post_id: ID,
    author: address,
}

/// Create a post owned by the sender. `media` is a list of Walrus blob IDs
/// (raw utf8 bytes each). Pass `option::none()` for a top-level post.
#[allow(lint(self_transfer))]
public fun create_post(
    text: vector<u8>,
    media: vector<vector<u8>>,
    reply_to: Option<ID>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let t = string::utf8(text);
    assert!(t.length() <= MAX_TEXT_LEN, ETextLen);
    let media_strings = to_strings(media);
    assert!(t.length() > 0 || media_strings.length() > 0, EEmpty);

    let now = clock.timestamp_ms();
    let author = ctx.sender();
    let post = Post {
        id: object::new(ctx),
        author,
        text: t,
        media: media_strings,
        reply_to,
        created_at_ms: now,
        updated_at_ms: now,
    };
    let post_id = object::id(&post);

    event::emit(PostCreated {
        post_id,
        author,
        text: clone(&post.text),
        media: clone_vec(&post.media),
        reply_to: post.reply_to, // Option<ID> is copy
        created_at_ms: now,
    });

    transfer::transfer(post, author);
}

/// Edit an owned post's text/media. Emits `PostEdited`; the indexer updates the
/// materialized row. Reply linkage and `created_at_ms` are preserved.
public fun edit_post(
    post: &mut Post,
    text: vector<u8>,
    media: vector<vector<u8>>,
    clock: &Clock,
    ctx: &TxContext,
) {
    assert!(post.author == ctx.sender(), ENotAuthor);
    let t = string::utf8(text);
    assert!(t.length() <= MAX_TEXT_LEN, ETextLen);
    let media_strings = to_strings(media);
    assert!(t.length() > 0 || media_strings.length() > 0, EEmpty);

    post.text = t;
    post.media = media_strings;
    post.updated_at_ms = clock.timestamp_ms();

    event::emit(PostEdited {
        post_id: object::id(post),
        author: post.author,
        text: clone(&post.text),
        media: clone_vec(&post.media),
        updated_at_ms: post.updated_at_ms,
    });
}

/// Delete an owned post. Emits `PostDeleted` so the indexer can tombstone it.
public fun delete_post(post: Post, ctx: &TxContext) {
    assert!(post.author == ctx.sender(), ENotAuthor);
    let Post { id, author, .. } = post;
    let post_id = id.to_inner();
    id.delete();
    event::emit(PostDeleted { post_id, author });
}

// ---- helpers ---------------------------------------------------------------

fun to_strings(raw: vector<vector<u8>>): vector<String> {
    let len = raw.length();
    assert!(len <= MAX_MEDIA, ETooManyMedia);
    let mut out: vector<String> = vector[];
    let mut i = 0;
    while (i < len) {
        out.push_back(string::utf8(*raw.borrow(i)));
        i = i + 1;
    };
    out
}

fun clone(s: &String): String {
    string::utf8(*s.as_bytes())
}

fun clone_vec(v: &vector<String>): vector<String> {
    let len = v.length();
    let mut out: vector<String> = vector[];
    let mut i = 0;
    while (i < len) {
        out.push_back(clone(v.borrow(i)));
        i = i + 1;
    };
    out
}

// ---- read-only accessors ---------------------------------------------------

public fun author(p: &Post): address { p.author }
public fun text(p: &Post): String { clone(&p.text) }
public fun media(p: &Post): vector<String> { clone_vec(&p.media) }
public fun reply_to(p: &Post): Option<ID> { p.reply_to }
public fun created_at_ms(p: &Post): u64 { p.created_at_ms }
public fun updated_at_ms(p: &Post): u64 { p.updated_at_ms }
