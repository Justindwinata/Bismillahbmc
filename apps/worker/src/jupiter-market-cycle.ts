import { JupiterTokenFeed,tokenObservation,tokenMarket } from '../../../packages/connectors/src/jupiter-tokens.js';
import type { Store } from '../../../packages/storage/src/index.js';
export async function jupiterMarketCycle(store:Pick<Store,'save'|'saveMarket'|'health'>,feed:Pick<JupiterTokenFeed,'recent'>=new JupiterTokenFeed()){
 try{for(const t of await feed.recent()){const source=tokenObservation(t);await store.save(source);await store.saveMarket(t.id,t.firstPool.id,tokenMarket(t),source.receivedAt,source.sourceAt);}await store.health('jupiter-tokens','OK',null);}catch{await store.health('jupiter-tokens','DEGRADED','PROVIDER_OR_PERSISTENCE_UNAVAILABLE');}
}
