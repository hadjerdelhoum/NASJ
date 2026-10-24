import { Router } from "express";
import { z } from "zod";
import { query } from "../database/db.js";
import { assertOwnsChild, requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { wrap } from "../middleware/errors.js";

export const childrenRouter = Router();
childrenRouter.use(requireAuth);

const childSchema = z.object({
  name: z.string().trim().min(1).max(40),
  age: z.number().int().min(3).max(10),
  language: z.enum(["fr", "ar"]).default("fr"),
});

childrenRouter.get(
  "/",
  wrap(async (req: AuthedRequest, res) => {
    const r = await query(
      "SELECT id, name, age, language FROM children WHERE parent_id=$1 ORDER BY created_at",
      [req.parentId]
    );
    res.json(r.rows);
  })
);

childrenRouter.post(
  "/",
  wrap(async (req: AuthedRequest, res) => {
    const c = childSchema.parse(req.body);
    const r = await query(
      "INSERT INTO children(parent_id, name, age, language) VALUES ($1,$2,$3,$4) RETURNING id, name, age, language",
      [req.parentId, c.name, c.age, c.language]
    );
    res.status(201).json(r.rows[0]);
  })
);

childrenRouter.get(
  "/:id/collection",
  wrap(async (req: AuthedRequest, res) => {
    await assertOwnsChild(req.parentId, req.params.id);
    const r = await query(
      `SELECT r.id, r.kind, r.name_fr, r.name_ar, r.universe_id, cr.earned_at
       FROM child_rewards cr JOIN rewards r ON r.id = cr.reward_id
       WHERE cr.child_id=$1 ORDER BY cr.earned_at`,
      [req.params.id]
    );
    res.json(r.rows);
  })
);

childrenRouter.get(
  "/:id/dashboard",
  wrap(async (req: AuthedRequest, res) => {
    await assertOwnsChild(req.parentId, req.params.id);
    const r = await query(
      `SELECT u.id AS universe_id, u.name_fr, u.name_ar,
              COUNT(a.id)::int AS total,
              COUNT(p.activity_id) FILTER (WHERE p.completed)::int AS completed,
              COALESCE(AVG(p.best_ratio) FILTER (WHERE p.attempts > 0), 0)::float AS avg_score,
              COALESCE(SUM(p.attempts), 0)::int AS attempts
       FROM universes u
       JOIN activities a ON a.universe_id = u.id
       LEFT JOIN progress p ON p.activity_id = a.id AND p.child_id = $1
       GROUP BY u.id ORDER BY u.position`,
      [req.params.id]
    );
    const total = r.rows.reduce((s, x) => s + x.total, 0);
    const done = r.rows.reduce((s, x) => s + x.completed, 0);
    res.json({ overall: total ? done / total : 0, universes: r.rows });
  })
);
