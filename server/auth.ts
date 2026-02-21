import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { Request, Response, NextFunction } from "express";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "15m";
const MIN_PASSWORD_LENGTH = Number(process.env.AUTH_MIN_PASSWORD_LENGTH || "8");

function jwtSecretStrength(secretInput?: string) {
  const secret = String(secretInput ?? process.env.JWT_SECRET ?? "");
  const tooShort = secret.length < 32;
  const insecurePattern =
    !secret ||
    /change-me|dev-secret|default|example|test|1234|password/i.test(secret);
  return !(tooShort || insecurePattern);
}

function assertJwtSecretSafety() {
  if (process.env.NODE_ENV !== "production") return;
  if (!jwtSecretStrength(process.env.JWT_SECRET)) {
    throw new Error(
      "Insecure JWT_SECRET for production. Use a strong secret with at least 32 chars.",
    );
  }
}

assertJwtSecretSafety();

export type JwtPayload = {
  sub: string; // username
};

export function validatePasswordPolicy(password: string): { ok: boolean; reason?: string } {
  const plain = String(password ?? "");
  if (plain.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: `Password must have at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (!/[a-zA-Z]/.test(plain) || !/\d/.test(plain)) {
    return { ok: false, reason: "Password must contain letters and numbers." };
  }
  if (/\s/.test(plain)) {
    return { ok: false, reason: "Password must not contain spaces." };
  }
  return { ok: true };
}

export function hashPassword(plain: string): string {
  const salt = bcrypt.genSaltSync(10);
  return bcrypt.hashSync(plain, salt);
}

export function hashPasswordForUserInput(plain: string): string {
  const policy = validatePasswordPolicy(plain);
  if (!policy.ok) {
    throw new Error(policy.reason || "Invalid password");
  }
  return hashPassword(plain);
}

export function getAuthSecurityConfig() {
  return {
    passwordPolicy: {
      minLength: MIN_PASSWORD_LENGTH,
      requiresLetters: true,
      requiresNumbers: true,
      disallowSpaces: true,
    },
    jwt: {
      expiresIn: JWT_EXPIRES_IN,
      productionSecretGuardEnabled: true,
      secretStrong: jwtSecretStrength(),
    },
  };
}

export function verifyPassword(plain: string, hash: string): boolean {
  return bcrypt.compareSync(plain, hash);
}

export function signToken(username: string): string {
  const payload: JwtPayload = { sub: username };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.header("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";

  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    (req as any).user = decoded;
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}
