import { initTRPC } from "@trpc/server";
import { prisma } from "../db";

// `type` (not `interface`) so it gets an implicit index signature and satisfies
// the @hono/trpc-server adapter's `Record<string, unknown>` context constraint.
export type Context = {
  prisma: typeof prisma;
};

export function createContext(): Context {
  return { prisma };
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
