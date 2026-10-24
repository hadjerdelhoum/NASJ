import { Router } from "express";
import { z } from "zod";
import { pool, query } from "../database/db.js";
import { assertOwnsChild, requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { HttpError, wrap } from "../middleware/errors.js";
import { grade, nextMastery } from "../services/grading.js";

export const contentRouter = Router();
contentRouter.use(requireAuth);

export const SESSION_SIZE = 5;

/** Universes with activities and the child's progress. Locking: an activity unlocks when the previous one is completed. */
contentRouter.get(
  "/universes",
  wrap(async (req: AuthedRequest, res) => {
    const childId = z.string().uuid().parse(req.query.childId);
    await assertOwnsChild(req.parentId, childId);
    const u = await query("SELECT * FROM universes ORDER BY position");
    const a = await query(
      `SELECT a.id, a.universe_id, a.position, a.kind, a.title_fr, a.title_ar,
              COALESCE(p.completed, false) AS completed, COALESCE(p.best_ratio, 0)::float AS best_ratio
       FROM activities a LEFT JOIN progress p ON p.activity_id = a.id AND p.child_id = $1
       ORDER BY a.universe_id, a.position`,
      [childId]
    );
    const universes = u.rows.map((uni) => {
      const acts = a.rows.filter((x) => x.universe_id === uni.id);
      let prevDone = true;
      const activities = acts.map((x) => {
        const status = x.completed ? "completed" : prevDone ? "available" : "locked";
        prevDone = x.completed;
        return { ...x, status };
      });
      const done = activities.filter((x) => x.completed).length;
      return { ...uni, activities, progress: activities.length ? done / activities.length : 0 };
    });
    res.json(universes);
  })
);

/**
 * Starts a session: serves a question set WITHOUT correct answers, at the child's current mastery level,
 * and remembers exactly which questions were served.
 */
contentRouter.get(
  "/activities/:id/session",
  wrap(async (req: AuthedRequest, res) => {
    const childId = z.string().uuid().parse(req.query.childId);
    await assertOwnsChild(req.parentId, childId);
    const act = await query(
      "SELECT id, universe_id, kind, title_fr, title_ar, config FROM activities WHERE id=$1",
      [req.params.id]
    );
    if (!act.rowCount) throw new HttpError(404, "Activity not found");
    const pr = await query("SELECT mastery FROM progress WHERE child_id=$1 AND activity_id=$2", [childId, req.params.id]);
    const mastery: number = pr.rows[0]?.mastery ?? 1;
    // Prefer questions at the child's level; fill with others if the pool is small.
    const q = await query(
      `SELECT id, payload, options FROM questions WHERE activity_id=$1
       ORDER BY (difficulty = $2) DESC, abs(difficulty - $2), random() LIMIT $3`,
      [req.params.id, mastery, SESSION_SIZE]
    );
    const s = await query<{ id: string }>(
      "INSERT INTO activity_sessions(child_id, activity_id, question_ids, mastery) VALUES ($1,$2,$3::uuid[],$4) RETURNING id",
      [childId, req.params.id, q.rows.map((r) => r.id), mastery]
    );
    res.json({ sessionId: s.rows[0].id, activity: act.rows[0], mastery, questions: q.rows });
  })
);

const answerSchema = z.object({
  childId: z.string().uuid(),
  questionId: z.string().uuid(),
  choice: z.number().int().min(0).max(9),
});

/**
 * Records the child's FIRST answer to a served question and tells them if it was right.
 * Answering again returns the stored first result, so repeated calls cannot be used to probe answers.
 */
contentRouter.post(
  "/sessions/:sid/answer",
  wrap(async (req: AuthedRequest, res) => {
    const sid = z.string().uuid().parse(req.params.sid);
    const { childId, questionId, choice } = answerSchema.parse(req.body);
    await assertOwnsChild(req.parentId, childId);
    const s = await query(
      "SELECT question_ids, completed_at FROM activity_sessions WHERE id=$1 AND child_id=$2",
      [sid, childId]
    );
    if (!s.rowCount) throw new HttpError(404, "Session not found");
    if (s.rows[0].completed_at) throw new HttpError(409, "Session already completed");
    if (!(s.rows[0].question_ids as string[]).includes(questionId)) throw new HttpError(400, "Question was not part of this session");

    const q = await query("SELECT correct_index, jsonb_array_length(options) AS n FROM questions WHERE id=$1", [questionId]);
    if (!q.rowCount) throw new HttpError(404, "Question not found");
    if (choice >= q.rows[0].n) throw new HttpError(400, "Invalid choice");

    await query(
      `INSERT INTO session_answers(session_id, question_id, choice, correct)
       VALUES ($1,$2,$3,$4) ON CONFLICT (session_id, question_id) DO NOTHING`,
      [sid, questionId, choice, choice === q.rows[0].correct_index]
    );
    const stored = await query("SELECT choice, correct FROM session_answers WHERE session_id=$1 AND question_id=$2", [sid, questionId]);
    res.json({
      correct: stored.rows[0].correct as boolean,
      choice: stored.rows[0].choice as number,
      correctIndex: q.rows[0].correct_index as number,
    });
  })
);

/** Finishes a session: grades the stored first answers on the server, updates progress and decides rewards. */
contentRouter.post(
  "/sessions/:sid/complete",
  wrap(async (req: AuthedRequest, res) => {
    const sid = z.string().uuid().parse(req.params.sid);
    const { childId } = z.object({ childId: z.string().uuid() }).parse(req.body);
    await assertOwnsChild(req.parentId, childId);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const s = await client.query(
        "SELECT id, activity_id, question_ids, completed_at, result FROM activity_sessions WHERE id=$1 AND child_id=$2 FOR UPDATE",
        [sid, childId]
      );
      if (!s.rowCount) throw new HttpError(404, "Session not found");
      const session = s.rows[0];
      if (session.completed_at) {
        // Idempotent: a retry (e.g. flaky network) returns the stored result and never double-awards.
        await client.query("COMMIT");
        return res.json(session.result);
      }

      const act = await client.query("SELECT id, universe_id, pass_ratio FROM activities WHERE id=$1", [session.activity_id]);
      const activity = act.rows[0];
      const qs = await client.query("SELECT id, correct_index FROM questions WHERE id = ANY($1::uuid[])", [session.question_ids]);
      const ans = await client.query("SELECT question_id, choice FROM session_answers WHERE session_id=$1", [sid]);
      const result = grade(
        qs.rows,
        ans.rows.map((a) => ({ questionId: a.question_id as string, choice: a.choice as number })),
        Number(activity.pass_ratio),
        (session.question_ids as string[]).length
      );

      const prev = await client.query(
        "SELECT best_ratio, attempts, completed, mastery FROM progress WHERE child_id=$1 AND activity_id=$2 FOR UPDATE",
        [childId, activity.id]
      );
      const p = prev.rows[0];
      const wasCompleted: boolean = p?.completed ?? false;
      const mastery = nextMastery(p?.mastery ?? 1, result.ratio);
      await client.query(
        `INSERT INTO progress(child_id, activity_id, best_ratio, attempts, completed, mastery)
         VALUES ($1,$2,$3,1,$4,$5)
         ON CONFLICT (child_id, activity_id) DO UPDATE SET
           best_ratio = GREATEST(progress.best_ratio, EXCLUDED.best_ratio),
           attempts = progress.attempts + 1,
           completed = progress.completed OR EXCLUDED.completed,
           mastery = EXCLUDED.mastery,
           updated_at = now()`,
        [childId, activity.id, result.ratio, result.passed, mastery]
      );

      const newRewards: { id: string; kind: string; name_fr: string; name_ar: string; universe_id: string | null }[] = [];
      if (result.passed && !wasCompleted) {
        const candidates = [`thread-${activity.id}`, "badge-first-steps"];
        // Universe patch once every activity in the universe is completed.
        const left = await client.query(
          `SELECT COUNT(*)::int AS n FROM activities a
           LEFT JOIN progress p ON p.activity_id=a.id AND p.child_id=$1
           WHERE a.universe_id=$2 AND COALESCE(p.completed,false)=false`,
          [childId, activity.universe_id]
        );
        if (left.rows[0].n === 0) candidates.push(`patch-${activity.universe_id}`);
        for (const rid of candidates) {
          const ins = await client.query(
            `INSERT INTO child_rewards(child_id, reward_id)
             SELECT $1, id FROM rewards WHERE id=$2
             ON CONFLICT DO NOTHING RETURNING reward_id`,
            [childId, rid]
          );
          if (ins.rowCount) {
            const r = await client.query("SELECT id, kind, name_fr, name_ar, universe_id FROM rewards WHERE id=$1", [rid]);
            newRewards.push(r.rows[0]);
          }
        }
      }

      const payload = {
        correct: result.correct,
        total: result.total,
        passed: result.passed,
        activityId: activity.id,
        universeId: activity.universe_id,
        perQuestion: result.perQuestion,
        newRewards,
      };
      await client.query("UPDATE activity_sessions SET completed_at=now(), result=$2 WHERE id=$1", [sid, JSON.stringify(payload)]);
      await client.query("COMMIT");
      res.json(payload);
    } catch (e) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  })
);

contentRouter.get(
  "/stories/:id",
  wrap(async (req, res) => {
    const r = await query("SELECT * FROM stories WHERE id=$1", [req.params.id]);
    if (!r.rowCount) throw new HttpError(404, "Story not found");
    res.json(r.rows[0]);
  })
);
