import { Request, Response } from "express";
import { z } from "zod";
import { successResponse, errorResponse } from "../lib/apiResponse";
import {
  getUserProfile,
  ensureUserProfile,
  updateUserProfile,
  adminUpdateUser,
} from "../services/user-profile.service";

// ─── Validation schemas ───────────────────────────────────────────────────────

const UpdateProfileSchema = z.object({
  name:      z.string().min(1).max(100).optional(),
  email:     z.string().email().optional(),
  avatarUrl: z.string().url().optional(),
  clubName:  z.string().max(120).optional(),
});

const AdminUpdateSchema = UpdateProfileSchema.extend({
  role: z.enum(["admin", "scout", "viewer"]).optional(),
  plan: z.string().max(50).optional(),
});

// ─── GET /api/user/profile ────────────────────────────────────────────────────

export async function getProfileController(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;

  // Auto-create profile on first access using JWT data
  const profile = await ensureUserProfile(userId, {
    email: req.user!.email || undefined,
  });

  res.json(successResponse(profile));
}

// ─── PATCH /api/user/profile ──────────────────────────────────────────────────

export async function updateProfileController(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;

  const parsed = UpdateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(errorResponse(parsed.error.issues[0]?.message ?? "Dados inválidos"));
    return;
  }

  // Ensure profile row exists before updating
  await ensureUserProfile(userId, { email: req.user!.email || undefined });

  const updated = await updateUserProfile(userId, parsed.data);
  res.json(successResponse(updated));
}

// ─── PATCH /api/admin/user/:id ────────────────────────────────────────────────

export async function adminUpdateUserController(req: Request, res: Response): Promise<void> {
  if (req.user!.role !== "admin") {
    res.status(403).json(errorResponse("Acesso restrito a administradores"));
    return;
  }

  const targetId = req.params["id"] as string;
  if (!targetId) {
    res.status(400).json(errorResponse("ID do usuário não fornecido"));
    return;
  }

  const parsed = AdminUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(errorResponse(parsed.error.issues[0]?.message ?? "Dados inválidos"));
    return;
  }

  const updated = await adminUpdateUser(targetId, parsed.data);
  res.json(successResponse(updated));
}

// ─── GET /api/admin/user/:id ──────────────────────────────────────────────────

export async function adminGetUserController(req: Request, res: Response): Promise<void> {
  if (req.user!.role !== "admin") {
    res.status(403).json(errorResponse("Acesso restrito a administradores"));
    return;
  }

  const targetId = req.params["id"] as string;
  if (!targetId) {
    res.status(400).json(errorResponse("ID do usuário não fornecido"));
    return;
  }

  const profile = await getUserProfile(targetId);
  if (!profile) {
    res.status(404).json(errorResponse("Usuário não encontrado"));
    return;
  }

  res.json(successResponse(profile));
}
