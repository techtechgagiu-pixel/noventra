-- D1-specific coordination. Legacy job/ticket IDs and records stay unchanged.
CREATE TABLE d1_custom_requests (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  period_key TEXT NOT NULL,
  count INTEGER NOT NULL CHECK(count BETWEEN 1 AND 20),
  settings TEXT NOT NULL,
  attempt_owner TEXT NOT NULL,
  PRIMARY KEY(user_id,request_id)
);
CREATE TABLE d1_custom_allowance (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_key TEXT NOT NULL,
  used INTEGER NOT NULL CONSTRAINT custom_daily_cap CHECK(used BETWEEN 0 AND 20),
  PRIMARY KEY(user_id,period_key)
);
-- Guard rows live only inside an atomic batch and are deleted before commit.
CREATE TABLE d1_request_guards (
  id TEXT PRIMARY KEY,
  settings_match INTEGER NOT NULL CONSTRAINT request_settings_match CHECK(settings_match=1),
  budget_available INTEGER NOT NULL CONSTRAINT request_budget_available CHECK(budget_available=1)
);
CREATE TABLE d1_review_allowance (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_key TEXT NOT NULL,
  used INTEGER NOT NULL CONSTRAINT review_daily_cap CHECK(used BETWEEN 0 AND 10),
  PRIMARY KEY(user_id,period_key)
);
