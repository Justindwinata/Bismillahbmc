ALTER TABLE research_journal ADD COLUMN lease_valid_until timestamptz;
CREATE FUNCTION enforce_paper_commit_fence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
 at_commit timestamptz := clock_timestamp();
 p jsonb;
 q jsonb := NEW.input->'quote';
 observed timestamptz;
 evidence_key text;
 action text;
BEGIN
 IF NEW.lease_valid_until IS NOT NULL AND at_commit >= NEW.lease_valid_until THEN
  RAISE EXCEPTION 'LEASE_LOST';
 END IF;
 SELECT r.action INTO action FROM agent_runs r WHERE r.decision_id=NEW.decision_id;
 IF action='SKIP' THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM paper_automations a WHERE a.session_id=NEW.session_id) AND NEW.lease_valid_until IS NULL THEN
  RAISE EXCEPTION 'LEASE_LOST';
 END IF;
 SELECT s.policy INTO p FROM research_sessions s WHERE s.id=NEW.session_id;
 observed := (q->>'receivedAt')::timestamptz;
 IF observed IS NULL OR at_commit < observed OR at_commit > observed+(p->>'quoteMaxAgeMs')::int*interval '1 millisecond'
  OR (q->>'expiresAt' IS NOT NULL AND at_commit >= (q->>'expiresAt')::timestamptz) THEN
  RAISE EXCEPTION 'EVIDENCE_EXPIRED_DURING_COMMIT';
 END IF;
 FOREACH evidence_key IN ARRAY ARRAY['chainEvidence','poolEvidence','transferEvidence'] LOOP
  IF NEW.input->evidence_key IS NOT NULL THEN
   observed := (NEW.input->evidence_key->>'verifiedAt')::timestamptz;
   IF observed IS NULL OR at_commit < observed OR at_commit > observed+(p->>'chainMaxAgeMs')::int*interval '1 millisecond' THEN
    RAISE EXCEPTION 'EVIDENCE_EXPIRED_DURING_COMMIT';
   END IF;
  END IF;
 END LOOP;
 IF COALESCE(NEW.input->>'requestedSide','BUY') <> 'SELL' THEN
  observed := (NEW.input->>'receivedAt')::timestamptz;
  IF observed IS NULL OR at_commit < observed OR at_commit > observed+(p->>'marketMaxAgeMs')::int*interval '1 millisecond' THEN
   RAISE EXCEPTION 'EVIDENCE_EXPIRED_DURING_COMMIT';
  END IF;
  IF NEW.input->>'sourceAt' IS NOT NULL THEN
   observed := (NEW.input->>'sourceAt')::timestamptz;
   IF at_commit < observed OR at_commit > observed+(p->>'marketMaxAgeMs')::int*interval '1 millisecond' THEN
    RAISE EXCEPTION 'EVIDENCE_EXPIRED_DURING_COMMIT';
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER paper_commit_fence AFTER INSERT ON research_journal
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_paper_commit_fence();
