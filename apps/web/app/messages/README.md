# Messages (`/messages`)

The Mystry messaging app, ported into ReeF/Umbra and re-skinned to the ReeF
design system. It lives entirely under this folder and is wired into the app via
the existing nav entry in `components/side-rail.tsx`.

## Architecture — one seam for the on-chain port

The whole UI talks to a single interface, **`lib/messaging.ts` (`Messaging`)**.
It never imports a backend directly — it imports `messaging` from `lib/index.ts`,
which picks an implementation:

```
lib/
  messaging.ts     ← THE INTERFACE (the on-chain handoff seam) + event union
  mock-adapter.ts  ← current impl: localStorage + in-memory event bus + seed
  sui-adapter.ts   ← TODO: implement this on the Sui stack, then flip index.ts
  index.ts         ← `export const messaging = new MockMessaging()`  ← one line to swap
  provider.tsx     ← React context + reducer (replaces Redux + socket.io)
  types.ts         ← data model (Message, Chat, Reaction, Poll, ChosenState, …)
  display.ts/format.ts ← presentation helpers
```

### Taking it on-chain

1. Implement every method of `Messaging` in `sui-adapter.ts` on top of:
   - `@mysten/sui-stack-messaging` — channels / DMs / groups / messages
   - `@mysten/walrus` — attachments (`uploadMedia` → blobId → URL)
   - `@mysten/seal` — gated content (the Vault / whisper / asides)
   - the zkLogin address passed to `setCurrentUser(me)` — identity
2. Feed real-time updates into `subscribe(handler)` (poll the SDK/indexer and
   emit the same `MessagingEvent`s the mock emits).
3. Flip the one line in `index.ts` from `MockMessaging` to `SuiMessaging`.

No component changes are required — the UI only knows the interface. Until the
adapter is implemented, every `SuiMessaging` method throws loudly.

### Identity

The current user comes from ReeF's zkLogin account (`useSocialAccount`) + the
indexer profile, derived in `provider.tsx` (`useMe`). There is no separate
sign-in — Mystry's OTP/invite auth was intentionally dropped.

## Features

- **Done:** DMs, groups (+ admin: add/remove/promote/leave, edit name/desc),
  reactions, edit, reply, forward, in-chat search, media + file + image viewer,
  typing, read receipts, mute/archive, whisper messages, polls, location,
  view-once photos, disappearing-message timer, saved + pinned, @mentions,
  the Vault (passcode-locked chats).
- **Not yet built:** aside *send* flow (audience picker — redaction rendering is
  already in `message-bubble.tsx`), stories/status, the Chosen party game.

## Mock notes (throwaway)

`mock-adapter.ts` persists to `localStorage["reef:messages:v1"]`, seeds a few
contacts/conversations, and has seeded contacts auto-reply so a single-user demo
feels alive. None of this is real multi-device messaging — that arrives with the
Sui adapter. The vault passcode in the mock is stored in plaintext (mock only);
the real adapter must use Seal.
