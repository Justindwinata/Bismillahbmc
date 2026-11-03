import { randomBytes,pbkdf2Sync,createCipheriv,createDecipheriv } from 'node:crypto';
const magic=Buffer.from('SENTINEL_BACKUP_V1\n');
const max=50*1024*1024;
export function sealBackup(data:Buffer,password:Buffer):Buffer{
 if(password.length<32||data.length>max)throw new Error('BACKUP_LIMIT_OR_PASSPHRASE');
 const salt=randomBytes(16),iv=randomBytes(12),key=pbkdf2Sync(password,salt,600000,32,'sha256');
 try{const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(magic);const body=Buffer.concat([cipher.update(data),cipher.final()]);return Buffer.concat([magic,salt,iv,cipher.getAuthTag(),body]);}finally{key.fill(0);}
}
export function openBackup(data:Buffer,password:Buffer):Buffer{
 if(password.length<32||data.length<magic.length+44||data.length>max+magic.length+44||!data.subarray(0,magic.length).equals(magic))throw new Error('BACKUP_FORMAT_OR_PASSPHRASE');
 const start=magic.length;const key=pbkdf2Sync(password,data.subarray(start,start+16),600000,32,'sha256');
 try{const decipher=createDecipheriv('aes-256-gcm',key,data.subarray(start+16,start+28));decipher.setAAD(magic);decipher.setAuthTag(data.subarray(start+28,start+44));return Buffer.concat([decipher.update(data.subarray(start+44)),decipher.final()]);}catch{throw new Error('BACKUP_AUTHENTICATION_FAILED');}finally{key.fill(0);}
}
