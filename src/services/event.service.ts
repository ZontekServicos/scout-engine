import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

export type EventType =
  | "PLAYER_VIEWED"
  | "PLAYER_COMPARED"
  | "SEARCH_PERFORMED"
  | "REPORT_GENERATED"
  | "GEM_OPENED";

interface EmitParams {
  userId: string;
  type: EventType;
  payload: Record<string, unknown>;
}

export const EventService = {
  emit({ userId, type, payload }: EmitParams): void {
    prisma.event
      .create({ data: { userId, type, payload: payload as Prisma.InputJsonValue } })
      .catch((err) => console.error("[event] emit failed:", err));
  },
};

export function emit(params: EmitParams): void {
  EventService.emit(params);
}
