import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function notFound(_req: Request, _res: Response, next: NextFunction) {
  next(new HttpError(404, "Not found"));
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Invalid request", details: err.flatten() });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  // body-parser failures (malformed JSON, payload too large) carry their own 4xx status
  const e = err as { status?: number; type?: string };
  if (e && typeof e.status === "number" && e.status >= 400 && e.status < 500 && e.type) {
    return res.status(e.status).json({ error: e.type === "entity.too.large" ? "Payload too large" : "Invalid request body" });
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}

/** Wraps async route handlers so rejections reach the error handler. */
export const wrap =
  (fn: (req: any, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);
