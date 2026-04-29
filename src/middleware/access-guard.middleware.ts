import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";

export type TrialStatus = "active" | "expiring_soon" | "expired";

export interface AccessInfo {
  isTrial: boolean;
  trialStatus: TrialStatus | null;
  trialEndsAt: Date | null;
  trialDaysRemaining: number | null;
}

declare global {
  namespace Express {
    interface Request {
      accessInfo?: AccessInfo;
    }
  }
}

function computeTrialStatus(trialEndsAt: Date): { status: TrialStatus; daysRemaining: number } {
  const msLeft = trialEndsAt.getTime() - Date.now();
  const daysRemaining = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
  const status: TrialStatus =
    daysRemaining <= 0 ? "expired" : daysRemaining <= 2 ? "expiring_soon" : "active";
  return { status, daysRemaining: Math.max(0, daysRemaining) };
}

export async function accessGuardMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    next();
    return;
  }

  try {
    const profile = await prisma.userProfile.findUnique({
      where: { id: userId },
      select: { isTrial: true, trialEndsAt: true },
    });

    if (profile?.isTrial && profile.trialEndsAt) {
      const { status, daysRemaining } = computeTrialStatus(profile.trialEndsAt);

      if (status === "expired") {
        res.status(403).json({ success: false, error: "trial_expired" });
        return;
      }

      req.accessInfo = {
        isTrial: true,
        trialStatus: status,
        trialEndsAt: profile.trialEndsAt,
        trialDaysRemaining: daysRemaining,
      };
    } else {
      req.accessInfo = {
        isTrial: false,
        trialStatus: null,
        trialEndsAt: null,
        trialDaysRemaining: null,
      };
    }

    next();
  } catch (err) {
    next(err);
  }
}
