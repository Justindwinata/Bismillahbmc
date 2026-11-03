CREATE TABLE program_revision_reviews (
 id uuid PRIMARY KEY,
 genesis text NOT NULL CHECK (genesis='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'),
 program text NOT NULL CHECK (program='CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C'),
 code_hash text NOT NULL CHECK (code_hash ~ '^[a-f0-9]{64}$'),
 evidence_hash text NOT NULL CHECK (evidence_hash ~ '^[a-f0-9]{64}$'),
 reviewer text NOT NULL CHECK (length(reviewer) BETWEEN 3 AND 100),
 review_reference text NOT NULL CHECK (length(review_reference) BETWEEN 10 AND 500),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE program_revision_revocations (
 review_id uuid PRIMARY KEY REFERENCES program_revision_reviews(id),
 reason text NOT NULL CHECK (length(reason) BETWEEN 3 AND 200),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION reject_program_review_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'IMMUTABLE_PROGRAM_REVIEW'; END; $$;
CREATE TRIGGER program_reviews_immutable BEFORE UPDATE OR DELETE ON program_revision_reviews FOR EACH ROW EXECUTE FUNCTION reject_program_review_mutation();
CREATE TRIGGER program_revocations_immutable BEFORE UPDATE OR DELETE ON program_revision_revocations FOR EACH ROW EXECUTE FUNCTION reject_program_review_mutation();
