import { PrismaClient } from "@prisma/client";

/** Shared Prisma client singleton. */
export const prisma = new PrismaClient();
