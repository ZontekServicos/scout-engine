import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

export type UserEventType =
  | "PLAYER_VIEWED"
  | "PLAYER_COMPARED"
  | "SEARCH_PERFORMED"
  | "REPORT_GENERATED"
  | "GEM_OPENED";

interface EmitParams {
  userId: string;
  type: UserEventType;
  payload: Record<string, unknown>;
}

export function emit({ userId, type, payload }: EmitParams): void {
  prisma.userEvent
    .create({ data: { userId, type, payload: payload as Prisma.InputJsonValue } })
    .catch((err) => console.error("[user-event] emit failed:", err));
}
