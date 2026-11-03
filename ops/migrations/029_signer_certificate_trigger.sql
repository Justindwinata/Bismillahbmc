-- Record fields differ between mandate and request rows; inspect them only in the matching branch.
CREATE OR REPLACE FUNCTION require_signer_certificate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='signer_mandates' THEN
  IF NEW.certificate IS NULL THEN RAISE EXCEPTION 'SIGNER_CERTIFICATE_REQUIRED'; END IF;
 ELSE
  IF NEW.guard_certificate IS NULL THEN RAISE EXCEPTION 'SIGNER_GUARD_CERTIFICATE_REQUIRED'; END IF;
 END IF;
 RETURN NEW;
END $$;
