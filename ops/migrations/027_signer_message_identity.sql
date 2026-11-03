-- One transaction/message identity cannot be assigned to several request IDs or mandates.
-- Retain old rows from pre-upgrade/failed qualification runs; bind the earliest identity, never rewrite evidence.
CREATE TABLE signer_message_bindings(wire_hash text PRIMARY KEY,request_id uuid NOT NULL UNIQUE REFERENCES signer_requests(id));
INSERT INTO signer_message_bindings(wire_hash,request_id)
SELECT DISTINCT ON(encode(sha256(decode(unsigned_wire,'base64')),'hex')) encode(sha256(decode(unsigned_wire,'base64')),'hex'),id FROM signer_requests ORDER BY encode(sha256(decode(unsigned_wire,'base64')),'hex'),created_at,id;
CREATE TRIGGER immutable_signer_message BEFORE UPDATE OR DELETE ON signer_message_bindings FOR EACH ROW EXECUTE FUNCTION deny_audit_mutation();
