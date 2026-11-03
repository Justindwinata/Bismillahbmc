-- Review registry remains verification-only; no signer or financial mandate is granted.
ALTER TABLE program_revision_reviews DROP CONSTRAINT program_revision_reviews_program_check;
ALTER TABLE program_revision_reviews ADD CONSTRAINT program_revision_reviews_program_check CHECK(program IN ('CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C','JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'));
