import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { query } from "../database/db.js";
import { signToken } from "../middleware/auth.js";
import { HttpError, wrap } from "../middleware/errors.js";

export const authRouter = Router();

const creds = z.object({
  email: z.string().email().max(200).transform((s) => s.toLowerCase()),
  password: z.string().min(8).max(200),
});

authRouter.post(
  "/register",
  wrap(async (req, res) => {
    const { email, password } = creds.parse(req.body);
    const hash = await bcrypt.hash(password, 12);
    try {
      const r = await query<{ id: string }>(
        "INSERT INTO parents(email, password_hash) VALUES ($1,$2) RETURNING id",
        [email, hash]
      );
      res.status(201).json({ token: signToken(r.rows[0].id) });
    } catch (e: any) {
      if (e.code === "23505") throw new HttpError(409, "Email already registered");
      throw e;
    }
  })
);

authRouter.post(
  "/login",
  wrap(async (req, res) => {
    const { email, password } = creds.parse(req.body);
    const r = await query<{ id: string; password_hash: string }>(
      "SELECT id, password_hash FROM parents WHERE email=$1",
      [email]
    );
    const row = r.rows[0];
    const ok = row ? await bcrypt.compare(password, row.password_hash) : false;
    if (!ok) throw new HttpError(401, "Invalid email or password");
    res.json({ token: signToken(row.id) });
  })
);
