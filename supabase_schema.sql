-- HSSC CIVIL JE 2026-27 schema for Supabase PostgreSQL
-- Run once in Supabase SQL Editor. Keep the database private; do not enable public access.
CREATE TABLE IF NOT EXISTS students (
  telegram_id TEXT PRIMARY KEY,
  first_name TEXT,
  username TEXT,
  joined_channel INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS exams (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  duration_minutes INTEGER NOT NULL DEFAULT 90,
  total_marks DOUBLE PRECISION NOT NULL DEFAULT 50,
  published INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS questions (
  id BIGSERIAL PRIMARY KEY,
  exam_id BIGINT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  options TEXT NOT NULL,
  correct_index INTEGER NOT NULL,
  explanation TEXT DEFAULT '',
  marks DOUBLE PRECISION DEFAULT 1
);
CREATE TABLE IF NOT EXISTS attempts (
  id BIGSERIAL PRIMARY KEY,
  exam_id BIGINT NOT NULL REFERENCES exams(id),
  telegram_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  category TEXT,
  answers TEXT NOT NULL DEFAULT '{}',
  marked_for_review TEXT NOT NULL DEFAULT '[]',
  score DOUBLE PRECISION DEFAULT 0,
  correct_count INTEGER DEFAULT 0,
  incorrect_count INTEGER DEFAULT 0,
  unanswered_count INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  time_taken_seconds INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
);
CREATE INDEX IF NOT EXISTS idx_attempts_student_exam ON attempts(exam_id, telegram_id, attempt_number);
