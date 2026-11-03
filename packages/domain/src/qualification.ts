export const requiredSoftwareGates=['SAFE_LOCKED_DEFAULTS','ACCOUNTING_AND_AUTONOMOUS_PAPER','MARKET_SECURITY_QUALIFIED','ELEVEN_ROLE_E2E','WALLET_COPY_PORTFOLIO','PHANTOM_OWNER_DEVICE','INDEPENDENT_VERIFIER_SIGNER_HARNESS','DURABLE_EXECUTION_RECONCILIATION','STRATEGY_OOS_WALK_FORWARD','DEPLOYMENT_AND_RESTORE','INDEPENDENT_SECURITY_REVIEW','OBSERVATION_7D','SHADOW_24H'] as const;
export type GateId=typeof requiredSoftwareGates[number];
export type GateProof={id:GateId;status:'PASS'|'FAIL'|'PARTIAL'|'BLOCKED_CODE'|'BLOCKED_PROVIDER'|'NOT_RUN'|'BLOCKED_OWNER'|'BLOCKED_TIME'|'BLOCKED_ENVIRONMENT';evidence:string|null;testedScopes?:string[];missingScopes?:string[]};
// A partial test/healthy transport cannot implicitly satisfy any missing software gate.
export function evaluateSoftwareGates(proofs:GateProof[]){
 if(new Set(proofs.map(p=>p.id)).size!==proofs.length||proofs.some(p=>!requiredSoftwareGates.includes(p.id)))throw new Error('INVALID_GATE_PROOFS');
 const gates=requiredSoftwareGates.map(id=>proofs.find(p=>p.id===id)??{id,status:'NOT_RUN' as const,evidence:null});
 const qualified=gates.every(g=>g.status==='PASS'&&typeof g.evidence==='string'&&g.evidence.trim().length>0);
 return {qualified,status:qualified?'SOFTWARE_QUALIFIED_FOR_OWNER_ACTIVATION':'IN_PROGRESS',gates,mainnetAuthorization:'NOT_GRANTED',liveVerified:false};
}
