import { it,expect } from 'vitest';
import { passwordHash,verifyPassword,cookieToken,digest } from '../apps/api/src/auth.js';
it('hashes passwords with independent salts and refuses malformed password hashes',async()=>{
  const first=await passwordHash('FIXTURE-owner-password');const second=await passwordHash('FIXTURE-owner-password');
  expect(first).not.toBe(second);expect(await verifyPassword('FIXTURE-owner-password',first)).toBe(true);
  expect(await verifyPassword('wrong',first)).toBe(false);expect(await verifyPassword('wrong','malformed')).toBe(false);
  expect(await verifyPassword('wrong','salt:xyz')).toBe(false);
  expect(cookieToken('x=y; sentinel_session='+'a'.repeat(64))).toBe('a'.repeat(64));
  expect(cookieToken('sentinel_session=bad')).toBeNull();expect(cookieToken(undefined)).toBeNull();
  expect(digest('fixture')).toHaveLength(64);
});
