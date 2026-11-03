-- Keep candidate enrichment bounded before joining per-token evidence; support fresh discovery without historical scans.
CREATE INDEX source_latest_market_candidate ON source_snapshots(source_key,received_at DESC,id DESC) WHERE provider IN ('dexscreener','jupiter-tokens');
CREATE INDEX market_recent_discovery ON market_observations(received_at DESC,mint,id DESC);
