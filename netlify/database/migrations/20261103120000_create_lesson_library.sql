-- Lesson library: finished slide visuals, saved so they can be reopened, downloaded and embedded.
-- A lesson is a small JSON document plus one audio clip per spoken line, stored in a second table so that no single
-- request has to carry a whole lesson (function requests are limited to about 6 MB).

CREATE TABLE lessons (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      text NOT NULL,
  owner_email   text,
  title         text NOT NULL,
  lang          text NOT NULL DEFAULT 'af',
  mode          text,
  voice_label   text,
  slide_label   text,
  words         integer,
  seconds       real,
  clip_count    integer NOT NULL DEFAULT 0,
  lesson        jsonb NOT NULL,
  html          text,
  -- unguessable id used by the public embed link; the link only works while is_public is true
  public_token  text NOT NULL UNIQUE,
  is_public     boolean NOT NULL DEFAULT false,
  -- saving: clips are still being uploaded; ready: complete and listed in the library
  status        text NOT NULL DEFAULT 'saving',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX lessons_owner_created_idx ON lessons (owner_id, created_at DESC);

CREATE TABLE lesson_audio (
  lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  idx       integer NOT NULL,
  mime      text NOT NULL DEFAULT 'audio/mpeg',
  data      bytea NOT NULL,
  PRIMARY KEY (lesson_id, idx)
);
