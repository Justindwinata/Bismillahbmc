CREATE TABLE paper_ledger_events (
 sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 session_id uuid NOT NULL REFERENCES research_sessions(id), request_key uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('FILL','DEPOSIT','WITHDRAW','RENT_RESERVE','RENT_REFUND')),
 amount numeric(20,0), rent_reference uuid,
 journal_id bigint UNIQUE REFERENCES research_journal(id), input_hash char(64) NOT NULL,
 source_class text NOT NULL CHECK(source_class IN ('REPLAY','PAPER_SIM','SHADOW')),
 snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(session_id,request_key),
 CHECK ((kind='FILL' AND journal_id IS NOT NULL AND amount IS NULL) OR (kind<>'FILL' AND journal_id IS NULL AND amount>0)),
 CHECK ((kind='RENT_REFUND')=(rent_reference IS NOT NULL))
);
INSERT INTO paper_ledger_events(session_id,request_key,kind,journal_id,input_hash,source_class,snapshot,created_at)
 SELECT session_id,request_key,'FILL',id,input_hash,fill->>'sourceClass',snapshot,recorded_at
 FROM research_journal WHERE fill IS NOT NULL ORDER BY id;
CREATE INDEX paper_ledger_session_order ON paper_ledger_events(session_id,sequence);
CREATE TRIGGER immutable_paper_ledger BEFORE UPDATE OR DELETE ON paper_ledger_events FOR EACH ROW EXECUTE FUNCTION deny_audit_mutation();
CREATE FUNCTION append_paper_fill_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.fill IS NOT NULL THEN
  INSERT INTO paper_ledger_events(session_id,request_key,kind,journal_id,input_hash,source_class,snapshot)
   VALUES(NEW.session_id,NEW.request_key,'FILL',NEW.id,NEW.input_hash,NEW.fill->>'sourceClass',NEW.snapshot);
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER append_paper_fill_event AFTER INSERT ON research_journal FOR EACH ROW EXECUTE FUNCTION append_paper_fill_event();
