export function providerDimensions(status:'OK'|'DEGRADED'|'NOT_CONFIGURED',reason:string|null,provider:string){
 let transport:'REACHABLE'|'UNREACHABLE'|'UNKNOWN'|'NOT_CONFIGURED'=status==='OK'?'REACHABLE':status==='NOT_CONFIGURED'?'NOT_CONFIGURED':'UNKNOWN';
 let quality:'VALID'|'INVALID'|'ERROR'|'UNKNOWN'|'NOT_CHECKED'=status==='OK'?'VALID':status==='NOT_CONFIGURED'?'NOT_CHECKED':'UNKNOWN';
 let subscription:'NOT_APPLICABLE'|'PENDING'|'PARTIAL'|'ACKNOWLEDGED'|'ERROR'|'STALE'='NOT_APPLICABLE';
 if(reason&&['HTTP_ERROR','RATE_LIMITED','SUBSCRIPTION_REJECTED','UNSUPPORTED_TRANSACTION_VERSION','RPC_METHOD_UNSUPPORTED','RPC_DATA_UNAVAILABLE','RPC_NODE_UNHEALTHY','RPC_ERROR'].includes(reason)){transport='REACHABLE';quality='ERROR';}
 if(reason&&['INVALID_RESPONSE','INVALID_WS_PAYLOAD','SUBSCRIPTION_ID_MISMATCH'].includes(reason)){transport='REACHABLE';quality='INVALID';}
 if(reason&&['TIMEOUT_OR_NETWORK','WS_NETWORK_ERROR','WS_DISCONNECTED_BACKFILL_REQUIRED'].includes(reason))transport='UNREACHABLE';
 if(provider==='solana-ws'){
  subscription=status==='OK'?'ACKNOWLEDGED':reason==='SUBSCRIPTION_PENDING'?'PENDING':reason==='SUBSCRIPTIONS_PARTIAL'?'PARTIAL':reason==='WS_STALE'?'STALE':'ERROR';
  if(['SUBSCRIPTION_PENDING','SUBSCRIPTIONS_PARTIAL'].includes(reason??'')){transport='REACHABLE';quality=reason==='SUBSCRIPTION_PENDING'?'NOT_CHECKED':'VALID';}
 }
 return {transport,quality,subscription,dataTick:provider==='solana-ws'&&status==='OK'&&reason===null};
}
export function receiptFreshness(at:string|null,now:number,ttl=90000){if(at===null)return 'UNKNOWN';const age=now-Date.parse(at);return !Number.isFinite(age)||age<0?'INVALID_FUTURE_OR_TIME':age>ttl?'STALE':'FRESH';}
// Diagnostic taxonomy only: never grants eligibility and never labels concentration as proof of fraud.
export function blockerCategory(reason:string){
 if(/KILL_SWITCH|HALTED/.test(reason))return 'OPERATOR_HALT';
 if(/OWNER_ACTIVATION|MODE_NOT_LIVE|SIGNER_LOCKED|ZERO_CAPS|ZERO_LIVE_CAPS/.test(reason))return 'AUTHORITY_NOT_GRANTED';
 if(/UNCONFIGURED/.test(reason))return 'POLICY_CONFIGURATION_MISSING';
 if(/REVIEW_REQUIRED|NOT_PINNED|NOT_SUPPORTED|NOT_QUALIFIED|UNQUALIFIED|UNSUPPORTED/.test(reason))return 'UNSUPPORTED_OR_UNREVIEWED';
 if(/STALE|EXPIRED|FUTURE/.test(reason))return 'STALE_OR_INVALID_TIME';
 if(/INCOMPLETE|MISSING|UNAVAILABLE_OWNERSHIP|DATA_UNAVAILABLE|OWNERSHIP_UNVERIFIED|NOT_CHECKED/.test(reason))return 'EVIDENCE_INCOMPLETE';
 if(/PROVIDER_|RATE_LIMITED|NETWORK|CIRCUIT|RPC_SCHEMA|RPC_OR_LAYOUT|REGISTRY_UNAVAILABLE|RPC_NODE_UNHEALTHY|RPC_ERROR/.test(reason))return 'PROVIDER_OR_DEPENDENCY_FAILURE';
 if(/HOLDER_CONCENTRATION|MINT_AUTHORITY|FREEZE_AUTHORITY|VAULT|LP_REDEEMABLE|SUPPLY_CONFLICT|SWAPS_DISABLED/.test(reason))return 'SECURITY_POLICY_VETO';
 if(/LIMIT|BUDGET|RESERVE|COOLDOWN|FEE|SIZE_|MARKET_BELOW_POLICY/.test(reason))return 'RISK_POLICY_VETO';
 if(/MISMATCH|MALFORMED|INVALID/.test(reason))return 'INVALID_EVIDENCE';
 return 'OTHER_REASON_REQUIRES_TRACE';
}
