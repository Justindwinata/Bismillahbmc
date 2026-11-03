ALTER TABLE source_snapshots DROP CONSTRAINT source_snapshots_provider_check;
ALTER TABLE source_snapshots ADD CONSTRAINT source_snapshots_provider_check CHECK(provider IN ('dexscreener','solana-rpc','jupiter-tokens'));
