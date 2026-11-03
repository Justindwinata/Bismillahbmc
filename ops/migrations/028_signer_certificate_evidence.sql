-- Preserve pre-upgrade qualification fixtures as-is; every new signer record requires auditable certificates.
ALTER TABLE signer_mandates ADD COLUMN certificate jsonb;
ALTER TABLE signer_requests ADD COLUMN guard_certificate jsonb;
CREATE FUNCTION require_signer_certificate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='signer_mandates' AND NEW.certificate IS NULL THEN RAISE EXCEPTION 'SIGNER_CERTIFICATE_REQUIRED'; END IF;
 IF TG_TABLE_NAME='signer_requests' AND NEW.guard_certificate IS NULL THEN RAISE EXCEPTION 'SIGNER_GUARD_CERTIFICATE_REQUIRED'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER require_signer_mandate_certificate BEFORE INSERT ON signer_mandates FOR EACH ROW EXECUTE FUNCTION require_signer_certificate();
CREATE TRIGGER require_signer_guard_certificate BEFORE INSERT ON signer_requests FOR EACH ROW EXECUTE FUNCTION require_signer_certificate();
CREATE FUNCTION protect_signer_guard_certificate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.guard_certificate IS DISTINCT FROM OLD.guard_certificate THEN RAISE EXCEPTION 'IMMUTABLE_SIGNER_GUARD'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER protect_signer_guard_certificate BEFORE UPDATE ON signer_requests FOR EACH ROW EXECUTE FUNCTION protect_signer_guard_certificate();
