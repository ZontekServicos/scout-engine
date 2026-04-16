import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// Disponível em: Supabase Dashboard → Settings → API → JWT Secret
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET ?? "";

interface SupabaseJwtPayload {
  sub: string;
  email?: string;
  user_metadata?: {
    role?: string;
    name?: string;
    clubName?: string;
  };
  exp?: number;
  iat?: number;
  role?: string; // papel no banco Supabase ("authenticated" | "anon") — não é o papel da app
}

export interface AuthUser {
  id: string;
  email: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!JWT_SECRET) {
    // Sem secret configurado: loga aviso e deixa passar (modo dev sem env)
    console.warn("[auth] SUPABASE_JWT_SECRET não definido — endpoint desprotegido");
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ success: false, error: "Token de autenticação não fornecido" });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as SupabaseJwtPayload;

    req.user = {
      id: decoded.sub,
      email: decoded.email ?? "",
      // O papel da aplicação fica em user_metadata, não no campo `role` do JWT
      role: decoded.user_metadata?.role ?? "scout",
    };

    next();
  } catch (err) {
    const message = err instanceof jwt.TokenExpiredError ? "Token expirado" : "Token inválido";
    res.status(401).json({ success: false, error: message });
  }
}
