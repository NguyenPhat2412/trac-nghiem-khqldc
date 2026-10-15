CREATE TABLE allocation_budgets(scope text NOT NULL, bucket bigint NOT NULL, expires_at bigint NOT NULL, used integer NOT NULL, PRIMARY KEY(scope,bucket));
CREATE INDEX allocation_budget_expiry ON allocation_budgets(expires_at);
CREATE INDEX active_attempt_deadline ON attempts(((data->>'deadline')::bigint)) WHERE data->>'status'='ACTIVE';
CREATE INDEX active_room_deadline ON rooms(((data->>'deadline')::bigint)) WHERE data->>'status'='QUESTION';
