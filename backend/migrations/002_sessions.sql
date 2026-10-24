-- Server-side activity sessions: the server remembers which questions it served and the
-- child's FIRST answer to each one, so per-question feedback can be shown immediately
-- without letting a client brute-force answers or award itself rewards.

CREATE TABLE IF NOT EXISTS activity_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  activity_id text NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  question_ids uuid[] NOT NULL,
  mastery int NOT NULL CHECK (mastery BETWEEN 1 AND 3),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  result jsonb
);
CREATE INDEX IF NOT EXISTS idx_sessions_child_activity ON activity_sessions(child_id, activity_id);

CREATE TABLE IF NOT EXISTS session_answers (
  session_id uuid NOT NULL REFERENCES activity_sessions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  choice int NOT NULL CHECK (choice >= 0),
  correct boolean NOT NULL,
  answered_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, question_id)
);
