/**
 * Control-message aggregation.
 *
 * Reactions, pins and poll votes have no server-side home — the chat is E2E
 * encrypted — so they travel as ordinary (hidden) messages and get folded onto
 * their target messages when a thread is materialized. Live arrivals apply the
 * same semantics incrementally through the provider's reducer.
 */

import { CONTROL_TYPES, type Message, type PollState } from "./types";

function viewOnceKey(me: string): string {
  return `reef:msg-viewonce:v1:${me.toLowerCase()}`;
}

export function readViewedOnce(me: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(window.localStorage.getItem(viewOnceKey(me)) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function markViewedOnce(me: string, messageId: string): void {
  if (typeof window === "undefined") return;
  const s = readViewedOnce(me);
  s.add(messageId);
  try {
    window.localStorage.setItem(viewOnceKey(me), JSON.stringify([...s].slice(-500)));
  } catch {
    /* quota */
  }
}

/** Apply one vote to a poll's voter registry (same rules everywhere). */
export function applyVote(poll: PollState, userId: string, optionIndex: number): PollState {
  const voters = { ...(poll.voters ?? {}) };
  const cur = voters[userId] ?? [];
  if (poll.allowMultiple) {
    voters[userId] = cur.includes(optionIndex) ? cur.filter((i) => i !== optionIndex) : [...cur, optionIndex];
  } else {
    voters[userId] = cur.includes(optionIndex) ? [] : [optionIndex];
  }
  return recount({ ...poll, voters });
}

function recount(poll: PollState): PollState {
  const voters = poll.voters ?? {};
  const options = poll.options.map((o, i) => ({
    ...o,
    votes: Object.values(voters).filter((v) => v.includes(i)).length,
  }));
  const totalVoters = Object.values(voters).filter((v) => v.length > 0).length;
  return { ...poll, options, totalVoters };
}

/**
 * Fold control messages (in chronological order) onto their targets and drop
 * them from the visible list. Also stamps my device-local view-once state and
 * recomputes each poll's `myVotes` for `meId`.
 */
export function applyControl(list: Message[], meId: string): Message[] {
  const byId = new Map<string, Message>();
  const visible: Message[] = [];
  for (const m of list) {
    if (!CONTROL_TYPES.has(m.type)) {
      const copy = { ...m };
      byId.set(copy.id, copy);
      visible.push(copy);
    }
  }
  const patch = (id: string | undefined, fn: (m: Message) => void) => {
    const t = id ? byId.get(id) : undefined;
    if (t) fn(t);
  };
  for (const m of list) {
    if (m.type === "reaction") {
      patch(m.targetId, (t) => {
        const reactions = (t.reactions ?? []).filter((r) => !(r.userId === m.senderId && r.emoji === m.content));
        t.reactions = m.remove ? reactions : [...reactions, { messageId: t.id, userId: m.senderId, emoji: m.content }];
      });
    } else if (m.type === "pin") {
      patch(m.targetId, (t) => {
        t.isPinned = Boolean(m.pinned);
      });
    } else if (m.type === "poll-vote" && m.optionIndex != null) {
      patch(m.targetId, (t) => {
        if (t.poll) t.poll = applyVote(t.poll, m.senderId, m.optionIndex!);
      });
    }
  }
  const viewed = readViewedOnce(meId);
  for (const m of visible) {
    if (m.viewOnce && viewed.has(m.id)) m.viewOnceViewed = true;
    if (m.poll) m.poll = { ...m.poll, myVotes: m.poll.voters?.[meId] ?? m.poll.myVotes ?? [] };
  }
  return visible;
}
