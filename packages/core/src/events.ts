/** Fully-qualified event type strings for our package, for indexer filters. */
import type { UmbraConfig } from "./config";

export const EVENT_MODULES = {
  profile: ["ProfileCreated", "ProfileUpdated"],
  post: ["PostCreated", "PostEdited", "PostDeleted"],
  follow: ["Followed", "Unfollowed"],
} as const;

export type EventName =
  | "ProfileCreated"
  | "ProfileUpdated"
  | "PostCreated"
  | "PostEdited"
  | "PostDeleted"
  | "Followed"
  | "Unfollowed";

const MODULE_OF: Record<EventName, keyof typeof EVENT_MODULES> = {
  ProfileCreated: "profile",
  ProfileUpdated: "profile",
  PostCreated: "post",
  PostEdited: "post",
  PostDeleted: "post",
  Followed: "follow",
  Unfollowed: "follow",
};

/** e.g. `0xPKG::post::PostCreated` */
export function eventType(cfg: UmbraConfig, name: EventName): string {
  return `${cfg.packageId}::${MODULE_OF[name]}::${name}`;
}

/** All event types we index, as `MoveModule` filters per module. */
export function eventModuleFilters(cfg: UmbraConfig): { package: string; module: string }[] {
  return (Object.keys(EVENT_MODULES) as (keyof typeof EVENT_MODULES)[]).map((module) => ({
    package: cfg.packageId,
    module,
  }));
}
