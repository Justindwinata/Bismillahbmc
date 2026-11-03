import { it,expect,vi } from 'vitest';
import { createApi } from '../apps/api/src/server.js';
const token='test-only-service-credential-xxxxxxxxxxxxxxxx';
const headers={authorization:`Bearer ${token}`};
const store=() => ({system:vi.fn().mockResolvedValue({mode:'OBSERVE',signer_enabled:false,providers:[]}),candidates:vi.fn().mockResolvedValue([]),halt:vi.fn().mockResolvedValue(undefined)});
it('protects all controls, rejects browser origin/cookie and raw sign endpoints',async () => {
  const db=store();const app=createApi(db,token);
  expect((await app.inject('/api/v1/health/live')).statusCode).toBe(200);
  for (const url of ['/api/v1/system','/api/v1/health/ready','/api/v1/market/candidates']) expect((await app.inject(url)).statusCode).toBe(401);
  for (const extra of [{origin:'https://evil.test'},{cookie:'session=fake'}]) expect((await app.inject({method:'POST',url:'/api/v1/system/halt',headers:{...headers,...extra}})).statusCode).toBe(403);
  expect((await app.inject({method:'POST',url:'/api/v1/system/halt'})).statusCode).toBe(401);
  expect(db.halt).not.toHaveBeenCalled();
  expect((await app.inject({url:'/api/v1/sign-raw-bytes',headers})).statusCode).toBe(404);
  await app.close();
});
it('shows readiness degraded, real empty state, and durable stop command',async () => {
  const db=store();const app=createApi(db,token);
  expect((await app.inject({url:'/api/v1/health/ready',headers})).statusCode).toBe(503);
  const system=await app.inject({url:'/api/v1/system',headers});
  expect(system.json()).toMatchObject({mode:'OBSERVE',signerEnabled:false,decision:{authorized:false}});
  expect(system.headers['cache-control']).toBe('no-store');
  expect((await app.inject({url:'/api/v1/market/candidates',headers})).json()).toEqual({classification:'DISCOVERY_LEADS_ONLY',items:[]});
  expect((await app.inject({method:'POST',url:'/api/v1/system/halt',headers})).json()).toEqual({mode:'HALTED',signerEnabled:false});
  expect(db.halt).toHaveBeenCalledExactlyOnceWith('local-service-owner');
  await app.close();
});
it('DB outage never reports healthy or leaks connection information',async () => {
  const db=store();db.system.mockRejectedValue(new Error('secret-database-url'));
  const app=createApi(db,token);
  const result=await app.inject({url:'/api/v1/system',headers});
  expect(result.statusCode).toBe(503);expect(result.body).not.toContain('secret-database-url');
  await app.close();
  expect(() => createApi(store(),'short')).toThrow('SERVICE_TOKEN_REQUIRED');
});
