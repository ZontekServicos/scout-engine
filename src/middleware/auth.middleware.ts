import { Request, Response, NextFunction } from "express";
import { createPublicKey, type KeyObject } from "crypto";
import jwt, { type JwtHeader } from "jsonwebtoken";

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
  role?: string;
}

interface DecodedJwt {
  header: JwtHeader;
  payload: SupabaseJwtPayload & {
    iss?: string;
    aud?: string;
  };
}

interface JwksResponse {
  keys?: Array<JsonWebKey & { kid?: string; alg?: string }>;
}

const publicKeyCache = new Map<string, KeyObject>();

function isTrustedSupabaseIssuer(issuer: string | undefined): issuer is string {
  if (!issuer) return false;

  try {
    const url = new URL(issuer);
    return (
      url.protocol === "https:" &&
      url.hostname.endsWith(".supabase.co") &&
      url.pathname === "/auth/v1"
    );
  } catch {
    return false;
  }
}

async function getSupabasePublicKey(issuer: string, kid: string): Promise<KeyObject> {
  const cacheKey = `${issuer}:${kid}`;
  const cached = publicKeyCache.get(cacheKey);
  if (cached) return cached;

  const response = await fetch(`${issuer}/.well-known/jwks.json`);
  if (!response.ok) {
    throw new Error(`Unable to fetch Supabase JWKS: ${response.status}`);
  }

  const jwks = (await response.json()) as JwksResponse;
  const jwk = jwks.keys?.find((key) => key.kid === kid);
  if (!jwk) {
    throw new Error("Supabase JWKS key not found");
  }

  const publicKey = createPublicKey({ key: jwk, format: "jwk" });
  publicKeyCache.set(cacheKey, publicKey);
  return publicKey;
}

async function verifySupabaseToken(token: string): Promise<SupabaseJwtPayload> {
  const decoded = jwt.decode(token, { complete: true }) as DecodedJwt | null;
  const algorithm = decoded?.header.alg;

  if (algorithm === "ES256") {
    const issuer = decoded?.payload.iss;
    const kid = decoded?.header.kid;
    if (!isTrustedSupabaseIssuer(issuer) || !kid) {
      throw new Error("Invalid Supabase token issuer or key id");
    }

    const publicKey = await getSupabasePublicKey(issuer, kid);
    return jwt.verify(token, publicKey, {
      algorithms: ["ES256"],
      issuer,
      audience: "authenticated",
    }) as SupabaseJwtPayload;
  }

  if (!JWT_SECRET) {
    throw new Error("SUPABASE_JWT_SECRET not set");
  }

  return jwt.verify(token, JWT_SECRET) as SupabaseJwtPayload;
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

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!JWT_SECRET) {
    console.warn("[auth] SUPABASE_JWT_SECRET not set - endpoint unprotected");
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ success: false, error: "Token de autenticacao nao fornecido" });
    return;
  }

  const token = authHeader.slice(7);
  let decoded: SupabaseJwtPayload;

  try {
    decoded = await verifySupabaseToken(token);
  } catch (err) {
    const message = err instanceof jwt.TokenExpiredError ? "Token expirado" : "Token invalido";
    res.status(401).json({ success: false, error: message });
    return;
  }

  req.user = {
    id: decoded.sub,
    email: decoded.email ?? "",
    role: decoded.user_metadata?.role ?? "scout",
  };

  next();
}
