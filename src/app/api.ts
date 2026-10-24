import type {
  AnswerResult,
  Child,
  CompleteResult,
  Dashboard,
  Lang,
  Reward,
  Session,
  Story,
  Universe,
} from "./types";

// Browser: same-origin ("/api", proxied in dev). Capacitor/native: set VITE_API_URL.
const BASE = `${(import.meta.env.VITE_API_URL as string | undefined) ?? ""}/api`;
const TOKEN_KEY = "nasj.token";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (t: string | null) => {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable (private mode): session simply won't persist */
    }
  },
};

async function request<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = tokenStore.get();
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers: {
        ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "network");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) window.dispatchEvent(new Event("nasj:unauthorized"));
    throw new ApiError(res.status, (data as { error?: string }).error ?? "error");
  }
  return data as T;
}

export const api = {
  health: () => request<{ ok: boolean; assistant: boolean }>("/health"),
  register: (email: string, password: string) => request<{ token: string }>("/auth/register", { body: { email, password } }),
  login: (email: string, password: string) => request<{ token: string }>("/auth/login", { body: { email, password } }),

  children: () => request<Child[]>("/children"),
  createChild: (c: { name: string; age: number; language: Lang }) => request<Child>("/children", { body: c }),
  collection: (childId: string) => request<Reward[]>(`/children/${childId}/collection`),
  dashboard: (childId: string) => request<Dashboard>(`/children/${childId}/dashboard`),

  universes: (childId: string) => request<Universe[]>(`/universes?childId=${childId}`),
  startSession: (activityId: string, childId: string) => request<Session>(`/activities/${activityId}/session?childId=${childId}`),
  answer: (sessionId: string, childId: string, questionId: string, choice: number) =>
    request<AnswerResult>(`/sessions/${sessionId}/answer`, { body: { childId, questionId, choice } }),
  complete: (sessionId: string, childId: string) => request<CompleteResult>(`/sessions/${sessionId}/complete`, { body: { childId } }),
  story: (id: string) => request<Story>(`/stories/${id}`),

  ask: (question: string) => request<{ answer: string }>("/assistant", { body: { question } }),
};
