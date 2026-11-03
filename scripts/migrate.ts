import { validateBootstrap,databasePool } from './runtime.js';
import { migrate } from '../packages/storage/src/index.js';
validateBootstrap();
const pool = databasePool();
try {await migrate(pool);console.log('Migration 001 applied/verified');}
catch {console.error('MIGRATION_FAILED');process.exitCode=1;}
finally {await pool.end();}
