-- "Vino cu biletul tău": user-built tickets analysed by the agents (slots REVIEW_1 … per day).
ALTER TABLE ticket_generation_jobs DROP CONSTRAINT IF EXISTS ticket_generation_jobs_slot_check;
ALTER TABLE ticket_generation_jobs ADD CONSTRAINT ticket_generation_jobs_slot_check
  CHECK (slot IN ('FIVE_A','FIVE_B','TWO_A','TWO_B','WEEKLY_100','TEN_A','TEN_B') OR slot ~ '^(CUSTOM|REVIEW)_[0-9]{1,3}$');
