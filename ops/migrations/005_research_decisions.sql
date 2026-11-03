ALTER TABLE agent_runs DROP CONSTRAINT agent_runs_mode_check;
ALTER TABLE agent_runs ADD CONSTRAINT agent_runs_mode_check CHECK(mode IN ('OBSERVE','HALTED','PAPER','SHADOW'));
ALTER TABLE agent_runs DROP CONSTRAINT agent_runs_action_check;
ALTER TABLE agent_runs ADD CONSTRAINT agent_runs_action_check CHECK(action='SKIP' OR (mode IN ('PAPER','SHADOW') AND action IN ('BUY_PROPOSED','SELL_PROPOSED')));
CREATE TABLE agent_cursors(mint text PRIMARY KEY,last_considered_at timestamptz NOT NULL DEFAULT clock_timestamp());
