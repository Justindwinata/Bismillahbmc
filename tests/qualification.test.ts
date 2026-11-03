import { it,expect } from 'vitest';
import { evaluateSoftwareGates,requiredSoftwareGates,type GateProof } from '../packages/domain/src/qualification.js';
it('missing evidence, owner/time gates or one failed test cannot be promoted by healthy providers or readiness labels',()=>{
 expect(evaluateSoftwareGates([]).qualified).toBe(false);const proofs:GateProof[]=requiredSoftwareGates.map(id=>({id,status:'PASS',evidence:'REPLAY_TEST qualification predicate only, not actual product evidence'}));const pass=evaluateSoftwareGates(proofs);expect(pass.status).toBe('SOFTWARE_QUALIFIED_FOR_OWNER_ACTIVATION');expect(pass.mainnetAuthorization).toBe('NOT_GRANTED');expect(pass.liveVerified).toBe(false);
 for(const status of ['FAIL','NOT_RUN','BLOCKED_OWNER','BLOCKED_TIME','BLOCKED_ENVIRONMENT'] as const)expect(evaluateSoftwareGates(proofs.map((p,i)=>i? p:{...p,status})).qualified).toBe(false);expect(evaluateSoftwareGates(proofs.map((p,i)=>i?p:{...p,evidence:null})).qualified).toBe(false);expect(()=>evaluateSoftwareGates([proofs[0]!,proofs[0]!])).toThrow('INVALID_GATE_PROOFS');
});
