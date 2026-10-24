import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "./app.js";
import { pool } from "./database/db.js";

// Integration tests run against the real PostgreSQL schema (npm run migrate && npm run seed first).
let dbUp = true;
try {
  await pool.query("SELECT 1");
} catch {
  dbUp = false;
}

const d = dbUp ? describe : describe.skip;

d("NASJ API (integration)", () => {
  let server: Server;
  let base = "";
  const stamp = Date.now();

  async function api(path: string, opts: { method?: string; token?: string; body?: unknown } = {}) {
    const res = await fetch(base + path, {
      method: opts.method ?? (opts.body ? "POST" : "GET"),
      headers: { "content-type": "application/json", ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    return { status: res.status, json: (await res.json().catch(() => ({}))) as any };
  }

  beforeAll(async () => {
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });
  afterAll(async () => {
    await pool.query("DELETE FROM parents WHERE email LIKE $1", [`test-${stamp}-%`]);
    server.close();
    await pool.end();
  });

  async function newFamily(tag: string) {
    const email = `test-${stamp}-${tag}@example.com`;
    const reg = await api("/auth/register", { body: { email, password: "correct horse battery" } });
    expect(reg.status).toBe(201);
    const token = reg.json.token as string;
    const child = await api("/children", { token, body: { name: "Lina", age: 5, language: "fr" } });
    expect(child.status).toBe(201);
    return { token, childId: child.json.id as string, email };
  }

  async function answerSession(token: string, childId: string, activityId: string, correct: boolean) {
    const s = await api(`/activities/${activityId}/session?childId=${childId}`, { token });
    expect(s.status).toBe(200);
    // the served questions must never carry the answer
    for (const q of s.json.questions) expect(q).not.toHaveProperty("correct_index");
    const rows = await pool.query("SELECT id, correct_index, jsonb_array_length(options) n FROM questions WHERE id = ANY($1::uuid[])", [
      s.json.questions.map((q: any) => q.id),
    ]);
    const key = new Map(rows.rows.map((r) => [r.id, r]));
    for (const q of s.json.questions) {
      const k = key.get(q.id)!;
      const choice = correct ? k.correct_index : (k.correct_index + 1) % k.n;
      const a = await api(`/sessions/${s.json.sessionId}/answer`, { token, body: { childId, questionId: q.id, choice } });
      expect(a.status).toBe(200);
      expect(a.json.correct).toBe(correct);
    }
    return s.json.sessionId as string;
  }

  it("requires authentication and rejects weak passwords", async () => {
    expect((await api("/universes")).status).toBe(401);
    const weak = await api("/auth/register", { body: { email: `test-${stamp}-weak@example.com`, password: "short" } });
    expect(weak.status).toBe(400);
  });

  it("lists five universes with only the first activity unlocked", async () => {
    const { token, childId } = await newFamily("list");
    const u = await api(`/universes?childId=${childId}`, { token });
    expect(u.status).toBe(200);
    expect(u.json).toHaveLength(5);
    for (const uni of u.json) {
      expect(uni.activities).toHaveLength(6);
      expect(uni.activities[0].status).toBe("available");
      expect(uni.activities.slice(1).every((a: any) => a.status === "locked")).toBe(true);
    }
  });

  it("awards a thread + badge only after the server grades a passing session, and never twice", async () => {
    const { token, childId } = await newFamily("reward");
    const sid = await answerSession(token, childId, "numbers-1", true);
    const done = await api(`/sessions/${sid}/complete`, { token, body: { childId } });
    expect(done.status).toBe(200);
    expect(done.json.passed).toBe(true);
    expect(done.json.newRewards.map((r: any) => r.id).sort()).toEqual(["badge-first-steps", "thread-numbers-1"]);

    // retrying the completion is idempotent and does not award again
    const again = await api(`/sessions/${sid}/complete`, { token, body: { childId } });
    expect(again.json).toEqual(done.json);
    const col = await api(`/children/${childId}/collection`, { token });
    expect(col.json).toHaveLength(2);

    // the next activity is now unlocked
    const u = await api(`/universes?childId=${childId}`, { token });
    const numbers = u.json.find((x: any) => x.id === "numbers");
    expect(numbers.activities[0].status).toBe("completed");
    expect(numbers.activities[1].status).toBe("available");

    // a second pass of the same activity yields no new rewards
    const sid2 = await answerSession(token, childId, "numbers-1", true);
    const done2 = await api(`/sessions/${sid2}/complete`, { token, body: { childId } });
    expect(done2.json.newRewards).toEqual([]);
  });

  it("does not reward a failing session", async () => {
    const { token, childId } = await newFamily("fail");
    const sid = await answerSession(token, childId, "numbers-1", false);
    const done = await api(`/sessions/${sid}/complete`, { token, body: { childId } });
    expect(done.json.passed).toBe(false);
    expect(done.json.newRewards).toEqual([]);
  });

  it("keeps the FIRST answer: changing it afterwards cannot turn a wrong answer right", async () => {
    const { token, childId } = await newFamily("first");
    const s = await api(`/activities/numbers-1/session?childId=${childId}`, { token });
    const q = s.json.questions[0];
    const row = (await pool.query("SELECT correct_index, jsonb_array_length(options) n FROM questions WHERE id=$1", [q.id])).rows[0];
    const wrong = (row.correct_index + 1) % row.n;
    const first = await api(`/sessions/${s.json.sessionId}/answer`, { token, body: { childId, questionId: q.id, choice: wrong } });
    expect(first.json.correct).toBe(false);
    const retry = await api(`/sessions/${s.json.sessionId}/answer`, { token, body: { childId, questionId: q.id, choice: row.correct_index } });
    expect(retry.json.correct).toBe(false);
  });

  it("rejects answers for questions that were not served in the session", async () => {
    const { token, childId } = await newFamily("foreign");
    const s = await api(`/activities/numbers-1/session?childId=${childId}`, { token });
    const other = (await pool.query("SELECT id FROM questions WHERE activity_id='letters-1' LIMIT 1")).rows[0].id;
    const a = await api(`/sessions/${s.json.sessionId}/answer`, { token, body: { childId, questionId: other, choice: 0 } });
    expect(a.status).toBe(400);
  });

  it("isolates children between parents", async () => {
    const a = await newFamily("iso-a");
    const b = await newFamily("iso-b");
    expect((await api(`/universes?childId=${a.childId}`, { token: b.token })).status).toBe(404);
    expect((await api(`/children/${a.childId}/dashboard`, { token: b.token })).status).toBe(404);
    const s = await api(`/activities/numbers-1/session?childId=${a.childId}`, { token: a.token });
    const steal = await api(`/sessions/${s.json.sessionId}/complete`, { token: b.token, body: { childId: b.childId } });
    expect(steal.status).toBe(404);
  });

  it("serves structured stories and a dashboard", async () => {
    const { token, childId } = await newFamily("story");
    const st = await api("/stories/little-star", { token });
    expect(st.status).toBe(200);
    expect(st.json.scenes.length).toBeGreaterThanOrEqual(3);
    const dash = await api(`/children/${childId}/dashboard`, { token });
    expect(dash.json.universes).toHaveLength(5);
    expect(dash.json.overall).toBe(0);
  });
});
