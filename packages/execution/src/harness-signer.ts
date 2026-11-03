import { fork, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { ExecutionIntent } from './verifier.js';
export class HarnessSigner {
    private constructor(private readonly child: ChildProcess, readonly publicKey: string) { }
    private static async call(child: ChildProcess, payload: Record<string, unknown>): Promise<Record<string, string>> { const id = randomUUID(); return new Promise((resolve, reject) => { const cleanup = () => { clearTimeout(timer); child.off('message', message); child.off('exit', exit); }; const exit = () => { cleanup(); reject(new Error('SIGNER_UNAVAILABLE')); }; const message = (raw: unknown) => { const m = raw as Record<string, string>; if (m.id !== id)
        return; cleanup(); if (m.error)
        reject(new Error(m.error));
    else
        resolve(m); }; const timer = setTimeout(() => { cleanup(); reject(new Error('SIGNER_TIMEOUT')); }, 5000); child.on('message', message); child.once('exit', exit); child.send({ ...payload, id }, error => { if (error) {
        cleanup();
        reject(new Error('SIGNER_UNAVAILABLE'));
    } }); }); }
    static async start(destination: string,swapMandate?:{pool:string;source:string;destination:string;mint:string;outputMint:string}) { const ts = import.meta.url.endsWith('.ts'); const child = fork(fileURLToPath(new URL(ts ? './signer-child.ts' : './signer-child.js', import.meta.url)), [], { execArgv: ts ? ['--import', 'tsx'] : [], stdio: ['ignore', 'ignore', 'ignore', 'ipc'], env: { PATH: process.env.PATH ?? '', NODE_ENV: 'test' } }); try {
        const response = await this.call(child, { method: 'init', destination,swapMandate });
        return new HarnessSigner(child, response.publicKey!);
    }
    catch (error) {
        child.kill();
        throw error;
    } }
    async sign(wire: Buffer, intent: ExecutionIntent,context?:import('./verifier.js').VerifyContext,policy?:import('./policy-signer.js').SignPolicyProof) { const response = await HarnessSigner.call(this.child, { method: 'sign', wire: wire.toString('base64'), intent,context,policy }); return { signature: response.signature!, transaction: response.transaction! }; }
    async requirePolicy(signingAuthorities:{owner:string;governor:string}){await HarnessSigner.call(this.child,{method:'require-policy',signingAuthorities});}
    async lookup(intentId:string){const response=await HarnessSigner.call(this.child,{method:'lookup',intentId});return response.found==='true'?{signature:response.signature!,transaction:response.transaction!}:null;}
    close() { this.child.disconnect(); this.child.kill(); }
}
