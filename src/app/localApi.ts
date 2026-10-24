/**
 * Offline mode: the same API surface as the server, but everything lives on the device (localStorage).
 * Used automatically by the Android app when it was built without an API address (VITE_API_URL).
 * The rules mirror backend/src/routes/*: first answer wins, grading at completion, rewards decided here only once,
 * adaptive mastery, one thread per activity, a patch per universe, a starter badge.
 */
import { ApiError } from "./errors";
import { activities, buildQuestions, stories, universes, type QuestionSeed } from "./localContent";
import type { AnswerResult, Child, CompleteResult, Dashboard, Lang, Question, Reward, Session, Story, Universe } from "./types";

const KEY = "nasj.local.v1";
const SESSION_SIZE = 5;
const PASS_RATIO = 0.6;

interface Parent { id: string; email: string; salt: string; hash: string }
interface ChildRow extends Child { parentId: string }
interface Progress { best_ratio: number; attempts: number; completed: boolean; mastery: number }
interface StoredQuestion { id: string; payload: Question["payload"]; options: string[]; correct: number }
interface SessionRow {
  id: string; childId: string; activityId: string; mastery: number; questions: StoredQuestion[];
  answers: Record<string, { choice: number; correct: boolean }>; result?: CompleteResult;
}
interface Db {
  parents: Parent[]; children: ChildRow[];
  progress: Record<string, Progress>; rewards: Record<string, { id: string; earned_at: string }[]>;
  sessions: Record<string, SessionRow>;
}

let memory: Db | null = null; // used if storage is unavailable
function load(): Db {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Db;
  } catch { /* fall through to a fresh database */ }
  return memory ?? { parents: [], children: [], progress: {}, rewards: {}, sessions: {} };
}
function save(db: Db) {
  memory = db;
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* keep in memory only */ }
}

const uid = () =>
  (globalThis.crypto && "randomUUID" in globalThis.crypto)
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

async function sha(text: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
    return String(h);
  }
}

function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

// Question bank, built once per launch (sessions keep their own snapshot).
let bank: (StoredQuestion & { activity: string; difficulty: number })[] | null = null;
function getBank() {
  if (!bank) {
    bank = buildQuestions().map((q: QuestionSeed, i) => {
      const options = shuffle([...new Set(q.options)]);
      return { id: `${q.activity}#${i}`, activity: q.activity, difficulty: q.difficulty, payload: q.payload, options, correct: options.indexOf(q.correct) };
    }).filter((q) => q.correct >= 0);
  }
  return bank;
}

const rewardCatalogue = (): Reward[] => [
  ...activities.map((a) => ({ id: `thread-${a.id}`, kind: "thread" as const, name_fr: `Fil : ${a.fr}`, name_ar: `خيط: ${a.ar}`, universe_id: a.universe })),
  ...universes.map((u) => ({ id: `patch-${u.id}`, kind: "patch" as const, name_fr: `Patch : ${u.name_fr}`, name_ar: `رقعة: ${u.name_ar}`, universe_id: u.id })),
  { id: "badge-first-steps", kind: "badge" as const, name_fr: "Premiers pas", name_ar: "الخطوات الأولى", universe_id: null },
];

function nextMastery(current: number, ratio: number): number {
  if (ratio >= 0.85) return Math.min(3, current + 1);
  if (ratio < 0.4) return Math.max(1, current - 1);
  return current;
}

export function makeLocalApi(getToken: () => string | null) {
  const parentId = (): string => {
    const t = getToken();
    const id = t?.startsWith("local:") ? t.slice(6) : null;
    if (!id || !load().parents.some((p) => p.id === id)) throw new ApiError(401, "Unauthorized");
    return id;
  };
  const ownChild = (db: Db, childId: string): ChildRow => {
    const c = db.children.find((x) => x.id === childId && x.parentId === parentId());
    if (!c) throw new ApiError(404, "Child not found");
    return c;
  };
  const credentials = (email: string, password: string) => {
    const e = String(email).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) || password.length < 8) throw new ApiError(400, "Invalid input");
    return e;
  };
  const prog = (db: Db, childId: string, activityId: string): Progress | undefined => db.progress[`${childId}|${activityId}`];

  return {
    health: async () => ({ ok: true, assistant: false }),

    register: async (email: string, password: string) => {
      const e = credentials(email, password);
      const db = load();
      if (db.parents.some((p) => p.email === e)) throw new ApiError(409, "Email already registered");
      const salt = uid();
      const p: Parent = { id: uid(), email: e, salt, hash: await sha(salt + password) };
      db.parents.push(p);
      save(db);
      return { token: `local:${p.id}` };
    },
    login: async (email: string, password: string) => {
      const e = String(email).trim().toLowerCase();
      const p = load().parents.find((x) => x.email === e);
      if (!p || p.hash !== (await sha(p.salt + password))) throw new ApiError(401, "Invalid email or password");
      return { token: `local:${p.id}` };
    },

    children: async (): Promise<Child[]> => {
      const pid = parentId();
      return load().children.filter((c) => c.parentId === pid).map(({ id, name, age, language }) => ({ id, name, age, language }));
    },
    createChild: async (c: { name: string; age: number; language: Lang }): Promise<Child> => {
      const pid = parentId();
      const name = String(c.name ?? "").trim();
      if (!name || name.length > 40 || !Number.isInteger(c.age) || c.age < 3 || c.age > 10) throw new ApiError(400, "Invalid input");
      const db = load();
      const row: ChildRow = { id: uid(), parentId: pid, name, age: c.age, language: c.language === "ar" ? "ar" : "fr" };
      db.children.push(row);
      save(db);
      return { id: row.id, name: row.name, age: row.age, language: row.language };
    },
    collection: async (childId: string): Promise<Reward[]> => {
      const db = load();
      ownChild(db, childId);
      const cat = rewardCatalogue();
      return (db.rewards[childId] ?? []).flatMap((r) => {
        const def = cat.find((x) => x.id === r.id);
        return def ? [{ ...def, earned_at: r.earned_at }] : [];
      });
    },
    dashboard: async (childId: string): Promise<Dashboard> => {
      const db = load();
      ownChild(db, childId);
      const rows = [...universes].sort((a, b) => a.position - b.position).map((u) => {
        const acts = activities.filter((a) => a.universe === u.id);
        const ps = acts.map((a) => prog(db, childId, a.id)).filter((p): p is Progress => !!p);
        const tried = ps.filter((p) => p.attempts > 0);
        return {
          universe_id: u.id, name_fr: u.name_fr, name_ar: u.name_ar, total: acts.length,
          completed: ps.filter((p) => p.completed).length,
          avg_score: tried.length ? tried.reduce((s, p) => s + p.best_ratio, 0) / tried.length : 0,
          attempts: ps.reduce((s, p) => s + p.attempts, 0),
        };
      });
      const total = rows.reduce((s, x) => s + x.total, 0);
      const done = rows.reduce((s, x) => s + x.completed, 0);
      return { overall: total ? done / total : 0, universes: rows };
    },

    universes: async (childId: string): Promise<Universe[]> => {
      const db = load();
      ownChild(db, childId);
      return [...universes].sort((a, b) => a.position - b.position).map((u) => {
        let prevDone = true;
        const acts = activities.filter((a) => a.universe === u.id).sort((a, b) => a.position - b.position).map((a) => {
          const p = prog(db, childId, a.id);
          const completed = p?.completed ?? false;
          const status = completed ? "completed" as const : prevDone ? "available" as const : "locked" as const;
          prevDone = completed;
          return { id: a.id, universe_id: a.universe, position: a.position, kind: a.kind, title_fr: a.fr, title_ar: a.ar, completed, best_ratio: p?.best_ratio ?? 0, status };
        });
        const done = acts.filter((a) => a.completed).length;
        return { ...u, activities: acts, progress: acts.length ? done / acts.length : 0 };
      });
    },

    startSession: async (activityId: string, childId: string): Promise<Session> => {
      const db = load();
      ownChild(db, childId);
      const act = activities.find((a) => a.id === activityId);
      if (!act) throw new ApiError(404, "Activity not found");
      const mastery = prog(db, childId, activityId)?.mastery ?? 1;
      const picked = shuffle(getBank().filter((q) => q.activity === activityId))
        .sort((a, b) => Math.abs(a.difficulty - mastery) - Math.abs(b.difficulty - mastery))
        .slice(0, SESSION_SIZE);
      const sid = uid();
      db.sessions[sid] = { id: sid, childId, activityId, mastery, answers: {}, questions: picked.map(({ id, payload, options, correct }) => ({ id, payload, options, correct })) };
      // keep storage small: forget old finished sessions
      const ids = Object.keys(db.sessions);
      if (ids.length > 60) for (const k of ids.slice(0, ids.length - 60)) delete db.sessions[k];
      save(db);
      return {
        sessionId: sid,
        activity: { id: act.id, universe_id: act.universe, kind: act.kind, title_fr: act.fr, title_ar: act.ar, config: (act.config ?? {}) as { storyId?: string; narrate?: boolean } },
        mastery,
        questions: picked.map(({ id, payload, options }) => ({ id, payload, options })),
      };
    },

    answer: async (sessionId: string, childId: string, questionId: string, choice: number): Promise<AnswerResult> => {
      const db = load();
      ownChild(db, childId);
      const s = db.sessions[sessionId];
      if (!s || s.childId !== childId) throw new ApiError(404, "Session not found");
      if (s.result) throw new ApiError(409, "Session already completed");
      const q = s.questions.find((x) => x.id === questionId);
      if (!q) throw new ApiError(400, "Question was not part of this session");
      if (!Number.isInteger(choice) || choice < 0 || choice >= q.options.length) throw new ApiError(400, "Invalid choice");
      if (!s.answers[questionId]) s.answers[questionId] = { choice, correct: choice === q.correct }; // first answer wins
      save(db);
      const a = s.answers[questionId];
      return { correct: a.correct, choice: a.choice, correctIndex: q.correct };
    },

    complete: async (sessionId: string, childId: string): Promise<CompleteResult> => {
      const db = load();
      ownChild(db, childId);
      const s = db.sessions[sessionId];
      if (!s || s.childId !== childId) throw new ApiError(404, "Session not found");
      if (s.result) return s.result; // idempotent
      const act = activities.find((a) => a.id === s.activityId)!;
      const total = s.questions.length;
      const perQuestion = s.questions.filter((q) => s.answers[q.id]).map((q) => ({ questionId: q.id, correct: s.answers[q.id].correct }));
      const correct = perQuestion.filter((p) => p.correct).length;
      const ratio = total === 0 ? 0 : correct / total;
      const passed = ratio >= PASS_RATIO;

      const key = `${childId}|${act.id}`;
      const prev = db.progress[key];
      const wasCompleted = prev?.completed ?? false;
      db.progress[key] = {
        best_ratio: Math.max(prev?.best_ratio ?? 0, ratio),
        attempts: (prev?.attempts ?? 0) + 1,
        completed: wasCompleted || passed,
        mastery: nextMastery(prev?.mastery ?? 1, ratio),
      };

      const newRewards: Reward[] = [];
      if (passed && !wasCompleted) {
        const candidates = [`thread-${act.id}`, "badge-first-steps"];
        const allDone = activities.filter((a) => a.universe === act.universe).every((a) => db.progress[`${childId}|${a.id}`]?.completed);
        if (allDone) candidates.push(`patch-${act.universe}`);
        const owned = (db.rewards[childId] ??= []);
        const cat = rewardCatalogue();
        for (const rid of candidates) {
          if (owned.some((r) => r.id === rid)) continue;
          const def = cat.find((x) => x.id === rid);
          if (!def) continue;
          owned.push({ id: rid, earned_at: new Date().toISOString() });
          newRewards.push(def);
        }
      }
      const result: CompleteResult = { correct, total, passed, activityId: act.id, universeId: act.universe, perQuestion, newRewards };
      s.result = result;
      save(db);
      return result;
    },

    story: async (id: string): Promise<Story> => {
      const s = stories.find((x) => x.id === id);
      if (!s) throw new ApiError(404, "Story not found");
      return s as Story;
    },

    ask: async (_question: string): Promise<{ answer: string }> => {
      throw new ApiError(503, "Assistant unavailable offline");
    },
  };
}
