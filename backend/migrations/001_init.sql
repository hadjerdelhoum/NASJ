CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS parents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS children (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  name text NOT NULL,
  age int NOT NULL CHECK (age BETWEEN 3 AND 10),
  language text NOT NULL DEFAULT 'fr' CHECK (language IN ('fr','ar')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_children_parent ON children(parent_id);

CREATE TABLE IF NOT EXISTS universes (
  id text PRIMARY KEY,
  position int NOT NULL,
  name_fr text NOT NULL,
  name_ar text NOT NULL,
  description_fr text NOT NULL,
  description_ar text NOT NULL,
  color text NOT NULL
);

CREATE TABLE IF NOT EXISTS activities (
  id text PRIMARY KEY,
  universe_id text NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
  position int NOT NULL,
  kind text NOT NULL,
  title_fr text NOT NULL,
  title_ar text NOT NULL,
  pass_ratio numeric NOT NULL DEFAULT 0.6,
  config jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_activities_universe ON activities(universe_id, position);

-- Multiple-choice style questions; the correct answer never leaves the server.
CREATE TABLE IF NOT EXISTS questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id text NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  difficulty int NOT NULL DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 3),
  payload jsonb NOT NULL,
  options jsonb NOT NULL,
  correct_index int NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_questions_activity ON questions(activity_id, difficulty);

CREATE TABLE IF NOT EXISTS stories (
  id text PRIMARY KEY,
  title_fr text NOT NULL,
  title_ar text NOT NULL,
  scenes jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS progress (
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  activity_id text NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  best_ratio numeric NOT NULL DEFAULT 0,
  attempts int NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  mastery int NOT NULL DEFAULT 1 CHECK (mastery BETWEEN 1 AND 3),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (child_id, activity_id)
);

CREATE TABLE IF NOT EXISTS rewards (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('thread','patch','badge')),
  name_fr text NOT NULL,
  name_ar text NOT NULL,
  universe_id text REFERENCES universes(id)
);

CREATE TABLE IF NOT EXISTS child_rewards (
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  reward_id text NOT NULL REFERENCES rewards(id) ON DELETE CASCADE,
  earned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (child_id, reward_id)
);
