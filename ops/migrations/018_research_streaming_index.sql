-- Support chronological bounded cursor reads without rewriting historical evidence.
CREATE INDEX IF NOT EXISTS research_journal_session_sequence ON research_journal(session_id,id);
