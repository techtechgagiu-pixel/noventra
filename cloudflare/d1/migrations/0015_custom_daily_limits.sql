-- 28.10 owner decision: 30 custom tickets a day for the owner, 3 for everyone else (checked per request in code via
-- d1_custom_limit_guards). The table-level cap rises from 20 to 30 so the owner's limit fits.
CREATE TABLE d1_custom_allowance_new (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_key TEXT NOT NULL,
  used INTEGER NOT NULL CONSTRAINT custom_daily_cap CHECK(used BETWEEN 0 AND 30),
  PRIMARY KEY(user_id,period_key)
);
INSERT INTO d1_custom_allowance_new(user_id,period_key,used) SELECT user_id,period_key,used FROM d1_custom_allowance;
DROP TABLE d1_custom_allowance;
ALTER TABLE d1_custom_allowance_new RENAME TO d1_custom_allowance;

CREATE TABLE d1_custom_requests_new (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  period_key TEXT NOT NULL,
  count INTEGER NOT NULL CHECK(count BETWEEN 1 AND 30),
  settings TEXT NOT NULL,
  attempt_owner TEXT NOT NULL,
  PRIMARY KEY(user_id,request_id)
);
INSERT INTO d1_custom_requests_new(user_id,request_id,period_key,count,settings,attempt_owner) SELECT user_id,request_id,period_key,count,settings,attempt_owner FROM d1_custom_requests;
DROP TABLE d1_custom_requests;
ALTER TABLE d1_custom_requests_new RENAME TO d1_custom_requests;

-- Guard rows live only inside an atomic batch and are deleted before commit.
CREATE TABLE d1_custom_limit_guards (
  id TEXT PRIMARY KEY,
  within INTEGER NOT NULL CONSTRAINT custom_user_limit CHECK(within=1)
);
