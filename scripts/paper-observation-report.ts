// Evidence report for actual worker LIVE_PROVIDER sessions only. No fixture or chain-fill claims.
import { Pool } from '../packages/storage/src/index.js';
const url=process.env.DATABASE_URL;if(!url)throw new Error('DATABASE_URL_REQUIRED');
const pool=new Pool({connectionString:url});
try{
 await pool.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const counts=(await pool.query(`SELECT count(*)::text AS decisions,count(DISTINCT j.session_id)::text AS sessions,
 min(j.recorded_at) AS first_decision,max(j.recorded_at) AS last_decision,
 count(*) FILTER (WHERE j.fill IS NOT NULL)::text AS paper_fills,
 count(*) FILTER (WHERE j.fill->>'side'='BUY')::text AS buys,
 count(*) FILTER (WHERE j.fill->>'side'='SELL')::text AS sells
 FROM research_journal j JOIN paper_automations a ON a.session_id=j.session_id WHERE a.scope='LIVE_PROVIDER'`)).rows[0];
 const reasons=(await pool.query(`SELECT e.role,reason,count(*)::text AS count FROM research_journal j JOIN paper_automations a ON a.session_id=j.session_id JOIN agent_events e ON e.decision_id=j.decision_id CROSS JOIN LATERAL jsonb_array_elements_text(e.payload->'output'->'reasons') reason WHERE a.scope='LIVE_PROVIDER' GROUP BY e.role,reason ORDER BY e.role,count(*) DESC`)).rows;
 const evidence=(await pool.query(`SELECT j.session_id,e.kind,e.received_at,e.source_hash,e.payload FROM paper_observations e JOIN paper_jobs j ON j.id=e.job_id JOIN paper_automations a ON a.session_id=j.session_id WHERE a.scope='LIVE_PROVIDER' ORDER BY e.received_at DESC LIMIT 12`)).rows;
 await pool.query('COMMIT');
 console.log(JSON.stringify({generatedAt:new Date().toISOString(),scope:'LIVE_PROVIDER_PAPER_SIMULATION_NOT_CHAIN',status:counts.buys==='0'?'NO_SAFE_ENTRY_OBSERVED':'PAPER_ACTIVITY_REQUIRES_PER_TRADE_REVIEW',counts,observationCaveat:'First/last timestamps are a decision window, not proof of uninterrupted uptime or qualifying soak duration.',reasons,evidence},null,2));
}finally{await pool.end();}
