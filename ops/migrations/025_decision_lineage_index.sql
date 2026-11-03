-- Correlation drilldown must not scan every historical decision/JSON snapshot.
CREATE INDEX research_journal_decision_lookup ON research_journal(decision_id);
