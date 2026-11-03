import { it,expect } from 'vitest';
import { sealBackup,openBackup } from '../scripts/backup-crypto.js';
it('encrypted backups authenticate header, salt, nonce, payload and passphrase before recovery',()=>{
 const password=Buffer.alloc(32,8),plain=Buffer.from('FIXTURE_PG_DUMP_NOT_REAL_USER_DATA');const encrypted=sealBackup(plain,password);
 expect(encrypted.includes(plain)).toBe(false);expect(openBackup(encrypted,password)).toEqual(plain);expect(sealBackup(plain,password)).not.toEqual(encrypted);
 expect(()=>openBackup(encrypted,Buffer.alloc(32,9))).toThrow('BACKUP_AUTHENTICATION_FAILED');
 for(const index of [0,20,38,50,encrypted.length-1]){const changed=Buffer.from(encrypted);changed[index]=changed[index]!^1;expect(()=>openBackup(changed,password)).toThrow();}
 expect(()=>openBackup(Buffer.alloc(1),password)).toThrow();expect(()=>sealBackup(plain,Buffer.alloc(3))).toThrow();expect(()=>openBackup(encrypted,Buffer.alloc(3))).toThrow();
});
