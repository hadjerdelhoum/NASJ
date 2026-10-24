import { pool } from "./db.js";
import { activities, buildQuestions, stories, universes } from "../seeds/content.js";

function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

async function main() {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    for (const u of universes) {
      await c.query(
        `INSERT INTO universes(id, position, name_fr, name_ar, description_fr, description_ar, color)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (id) DO UPDATE SET position=$2, name_fr=$3, name_ar=$4, description_fr=$5, description_ar=$6, color=$7`,
        [u.id, u.position, u.name_fr, u.name_ar, u.description_fr, u.description_ar, u.color]
      );
    }
    for (const a of activities) {
      await c.query(
        `INSERT INTO activities(id, universe_id, position, kind, title_fr, title_ar, config)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (id) DO UPDATE SET universe_id=$2, position=$3, kind=$4, title_fr=$5, title_ar=$6, config=$7`,
        [a.id, a.universe, a.position, a.kind, a.fr, a.ar, JSON.stringify(a.config ?? {})]
      );
    }
    for (const s of stories) {
      await c.query(
        `INSERT INTO stories(id, title_fr, title_ar, scenes) VALUES ($1,$2,$3,$4)
         ON CONFLICT (id) DO UPDATE SET title_fr=$2, title_ar=$3, scenes=$4`,
        [s.id, s.title_fr, s.title_ar, JSON.stringify(s.scenes)]
      );
    }

    // Replace question bank (progress is keyed by activity, not question, so this is safe).
    await c.query("DELETE FROM questions");
    for (const q of buildQuestions()) {
      const options = shuffle([...new Set(q.options)]);
      const correct = options.indexOf(q.correct);
      if (correct < 0) throw new Error(`Question in ${q.activity} lost its correct option: ${q.correct}`);
      await c.query(
        "INSERT INTO questions(activity_id, difficulty, payload, options, correct_index) VALUES ($1,$2,$3,$4,$5)",
        [q.activity, q.difficulty, JSON.stringify(q.payload), JSON.stringify(options), correct]
      );
    }

    // Reward catalogue: one thread per activity, one patch per universe, one starter badge.
    for (const a of activities) {
      await c.query(
        `INSERT INTO rewards(id, kind, name_fr, name_ar, universe_id) VALUES ($1,'thread',$2,$3,$4)
         ON CONFLICT (id) DO UPDATE SET name_fr=$2, name_ar=$3`,
        [`thread-${a.id}`, `Fil : ${a.fr}`, `خيط: ${a.ar}`, a.universe]
      );
    }
    for (const u of universes) {
      await c.query(
        `INSERT INTO rewards(id, kind, name_fr, name_ar, universe_id) VALUES ($1,'patch',$2,$3,$4)
         ON CONFLICT (id) DO UPDATE SET name_fr=$2, name_ar=$3`,
        [`patch-${u.id}`, `Patch : ${u.name_fr}`, `رقعة: ${u.name_ar}`, u.id]
      );
    }
    await c.query(
      `INSERT INTO rewards(id, kind, name_fr, name_ar) VALUES ('badge-first-steps','badge','Premiers pas','الخطوات الأولى')
       ON CONFLICT (id) DO NOTHING`
    );
    await c.query("COMMIT");
    console.log("seeded");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
