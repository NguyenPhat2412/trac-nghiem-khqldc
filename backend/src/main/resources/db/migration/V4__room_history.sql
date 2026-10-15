-- Immutable quiz snapshots and cold answer history stay out of the contended room row.
-- Legacy aggregates are converted transactionally on their next locked mutation.
CREATE TABLE room_snapshots (
  room_id text PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
  data jsonb NOT NULL
);
CREATE TABLE room_history (
  room_id text NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  player_id text NOT NULL,
  data jsonb NOT NULL,
  PRIMARY KEY (room_id, player_id)
);
CREATE INDEX room_deadlines ON rooms (((data->>'deadline')::bigint))
  WHERE data->>'status' = 'QUESTION';
