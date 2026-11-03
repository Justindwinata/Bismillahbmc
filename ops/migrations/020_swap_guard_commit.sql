-- A proposal is evidence, not authorization to bypass a fresh transaction-bound Guard.
ALTER TABLE execution_swap_proposals ADD COLUMN input jsonb;
