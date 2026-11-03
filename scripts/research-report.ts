import { databasePool,validateBootstrap } from './runtime.js';
import { ResearchStore } from '../packages/storage/src/research.js';
validateBootstrap();const id=process.argv[2];if(!id)throw new Error('EXPLICIT_RESEARCH_SESSION_ID_REQUIRED');const pool=databasePool();try{console.log(JSON.stringify({sessionId:id,generatedAt:new Date().toISOString(),report:await new ResearchStore(pool).performance(id)},null,2));}finally{await pool.end();}
