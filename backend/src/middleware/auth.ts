import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { query } from "../database/db.js";
import { HttpError } from "./errors.js";

export interface AuthedRequest extends Request {
  parentId?: string;
}

export function signToken(parentId: string): string {
  return jwt.sign({ sub: parentId }, config.jwtSecret, { expiresIn: "30d" });
}

export function requireAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return next(new HttpError(401, "Authentication required"));
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { sub: string };
    req.parentId = payload.sub;
    next();
  } catch {
    next(new HttpError(401, "Invalid or expired token"));
  }
}

/** Ensures the child belongs to the authenticated parent. */
export async function assertOwnsChild(parentId: string | undefined, childId: string) {
  if (!parentId) throw new HttpError(401, "Authentication required");
  const r = await query("SELECT 1 FROM children WHERE id=$1 AND parent_id=$2", [childId, parentId]);
  if (!r.rowCount) throw new HttpError(404, "Child not found");
}
