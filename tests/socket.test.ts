import { it,expect,vi } from 'vitest';
import { createApi } from '../apps/api/src/server.js';
it('serves health over a real local HTTP socket and authenticates control reads',async () => {
  const token='test-only-service-credential-xxxxxxxxxxxxxxxx';
  const store={system:vi.fn().mockResolvedValue({mode:'OBSERVE',signer_enabled:false,providers:[]}),candidates:vi.fn().mockResolvedValue([]),halt:vi.fn().mockResolvedValue(undefined)};
  const app=createApi(store,token);
  const url=await app.listen({host:'127.0.0.1',port:0});
  try {
    expect((await fetch(url+'/api/v1/health/live')).status).toBe(200);
    expect((await fetch(url+'/api/v1/system')).status).toBe(401);
    const actual=await fetch(url+'/api/v1/system',{headers:{authorization:`Bearer ${token}`}});
    expect((await actual.json() as {release:string}).release).toBe('NOT_LIVE_VERIFIED');
  } finally {await app.close();}
});
it('real Node WebSocket handshake failure is contained without recursive close or worker termination',async()=>{
 const {createServer}=await import('node:http'),{startReadSubscriptions}=await import('../packages/connectors/src/websocket.js');const server=createServer();server.on('upgrade',(_request,socket)=>socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'));await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const port=(server.address() as {port:number}).port;let stop:(()=>void)|undefined,timer:ReturnType<typeof setTimeout>|undefined;const statuses:string[]=[];
 try{await new Promise<void>((resolve,reject)=>{timer=setTimeout(()=>reject(new Error('WS_FAILURE_NOT_OBSERVED')),5000);stop=startReadSubscriptions('ws://127.0.0.1:'+port,[],()=>reject(new Error('FAILED_HANDSHAKE_MUST_NOT_PRODUCE_DATA')),(_status,reason)=>{if(reason)statuses.push(reason);if(reason==='WS_NETWORK_ERROR')resolve();});});expect(statuses).toContain('WS_NETWORK_ERROR');expect(()=>stop?.()).not.toThrow();}finally{clearTimeout(timer);stop?.();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
