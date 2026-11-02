CREATE INDEX IF NOT EXISTS open_room_deadlines
  ON rooms (((data->>'deadline')::bigint))
  WHERE data->>'status' = 'OPEN';
