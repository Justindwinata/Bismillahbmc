import { createHash,randomBytes,scrypt as scryptCallback,timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt=promisify(scryptCallback);
export const digest=(value:string) => createHash('sha256').update(value).digest('hex');
export const opaque=() => randomBytes(32).toString('hex');
export async function passwordHash(password:string): Promise<string> {
  const salt=opaque();
  const hash=await scrypt(password,salt,64) as Buffer;
  return salt+':'+hash.toString('hex');
}
export async function verifyPassword(password:string,stored:string): Promise<boolean> {
  const [salt,hash]=stored.split(':');
  if (!salt || !hash || !/^[a-f0-9]{128}$/.test(hash)) return false;
  const actual=await scrypt(password,salt,64) as Buffer;
  return timingSafeEqual(actual,Buffer.from(hash,'hex'));
}
export function cookieToken(cookie:string|undefined):string|null {
  const token=cookie?.split(';').map(c => c.trim()).find(c => c.startsWith('sentinel_session='))?.slice(17);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}
