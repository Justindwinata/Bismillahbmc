import { validateBootstrap,databasePool } from './runtime.js';
import { Store } from '../packages/storage/src/index.js';
validateBootstrap();
const pool = databasePool();
try {console.log(JSON.stringify({observedAt:new Date().toISOString(),...await new Store(pool).system(),signerEnabled:false,release:'NOT_LIVE_VERIFIED'}));}
catch {console.error('DATABASE_UNAVAILABLE');process.exitCode=1;}
finally {await pool.end();}
