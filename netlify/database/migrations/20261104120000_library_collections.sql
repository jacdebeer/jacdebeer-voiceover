-- Collections (every slide of a course saved as its own lesson), slide audio kept on its own, and what is needed to reopen a lesson for editing.
CREATE TABLE collections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    text NOT NULL,
  title       text NOT NULL,
  lang        text NOT NULL DEFAULT 'af',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX collections_owner_idx ON collections (owner_id, created_at DESC);

-- lesson: finished visuals + voice. audio: the voice-over of one slide, without visuals.
ALTER TABLE lessons ADD COLUMN kind text NOT NULL DEFAULT 'lesson';
-- deleting a collection deletes its lessons (and their clips)
ALTER TABLE lessons ADD COLUMN collection_id uuid REFERENCES collections(id) ON DELETE CASCADE;
ALTER TABLE lessons ADD COLUMN position integer;
-- the slide text, narration mode and voice the lesson was made from, so it can be opened again in the studio
ALTER TABLE lessons ADD COLUMN source jsonb;
CREATE INDEX lessons_collection_idx ON lessons (collection_id, position);
