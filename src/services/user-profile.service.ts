import { prisma } from "../lib/prisma";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UpdateProfileData {
  name?:        string;
  email?:       string;
  avatarUrl?:   string;
  clubName?:    string;
  clubLogoUrl?: string;
}

export interface AdminUpdateData extends UpdateProfileData {
  role?:           string;
  plan?:           string;
  isTrial?:        boolean;
  trialEndsAt?:    Date | null;
  trialGrantedAt?: Date | null;
  jobTitle?:       string | null;
}

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * Returns the profile for the given userId, or null if it doesn't exist yet.
 */
export async function getUserProfile(userId: string) {
  return prisma.userProfile.findUnique({ where: { id: userId } });
}

/**
 * Creates the profile on first login if it doesn't exist.
 * Subsequent calls are no-ops — never overwrites user-edited data.
 */
export async function ensureUserProfile(
  userId: string,
  defaults: { email?: string; name?: string } = {},
) {
  return prisma.userProfile.upsert({
    where: { id: userId },
    create: {
      id: userId,
      email: defaults.email ?? null,
      name: defaults.name ?? null,
    },
    update: {},
  });
}

/**
 * Updates the caller's own profile (name, email, avatarUrl, clubName).
 * Role and plan are intentionally excluded — users cannot self-elevate.
 */
export async function updateUserProfile(userId: string, data: UpdateProfileData) {
  const filtered: UpdateProfileData = {};
  if (data.name        !== undefined) filtered.name        = data.name;
  if (data.email       !== undefined) filtered.email       = data.email;
  if (data.avatarUrl   !== undefined) filtered.avatarUrl   = data.avatarUrl;
  if (data.clubName    !== undefined) filtered.clubName    = data.clubName;
  if (data.clubLogoUrl !== undefined) filtered.clubLogoUrl = data.clubLogoUrl;

  return prisma.userProfile.update({
    where: { id: userId },
    data: filtered,
  });
}

/**
 * Admin-only: upserts any user's profile including role and plan.
 */
export async function adminUpdateUser(userId: string, data: AdminUpdateData) {
  return prisma.userProfile.upsert({
    where: { id: userId },
    create: { id: userId, ...data },
    update: data,
  });
}

/**
 * Activates trial for a user for the given number of days.
 */
export async function grantTrial(userId: string, days: number) {
  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return prisma.userProfile.upsert({
    where: { id: userId },
    create: {
      id: userId,
      isTrial: true,
      trialGrantedAt: now,
      trialEndsAt,
      plan: "trial",
    },
    update: {
      isTrial: true,
      trialGrantedAt: now,
      trialEndsAt,
      plan: "trial",
    },
  });
}

/**
 * Revokes trial access for a user immediately.
 */
export async function revokeTrial(userId: string) {
  return prisma.userProfile.update({
    where: { id: userId },
    data: {
      isTrial: false,
      trialGrantedAt: null,
      trialEndsAt: null,
      plan: "free",
    },
  });
}
