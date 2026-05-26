import { randomBytes, scrypt } from "node:crypto";
import {
  PASSWORD_SCRYPT_DK_LEN,
  PASSWORD_SCRYPT_MAXMEM_BLOCK_BYTES,
  PASSWORD_SCRYPT_MAXMEM_MULTIPLIER,
  PASSWORD_SCRYPT_N,
  PASSWORD_SCRYPT_P,
  PASSWORD_SCRYPT_R,
  PASSWORD_SALT_BYTES,
} from "../config";

// Lower cost in the test runner so password tests finish in milliseconds instead of seconds.
// Production always uses N=16384 (OWASP minimum for interactive logins).
const scryptConfig = {
  N: PASSWORD_SCRYPT_N,
  r: PASSWORD_SCRYPT_R,
  p: PASSWORD_SCRYPT_P,
  dkLen: PASSWORD_SCRYPT_DK_LEN,
} as const;
const scryptMaxmem = PASSWORD_SCRYPT_MAXMEM_BLOCK_BYTES
  * PASSWORD_SCRYPT_N
  * scryptConfig.r
  * PASSWORD_SCRYPT_MAXMEM_MULTIPLIER;

/**
 * Hashes a password using `node:crypto.scrypt` with a random 16-byte salt.
 *
 * The stored format is `salt:derivedKey` where both parts are hex-encoded.
 * Passwords are NFKC-normalized before hashing so that visually equivalent
 * Unicode forms (full-width / half-width, composed / decomposed) produce
 * the same hash.
 *
 * This is wired into Better Auth via `emailAndPassword.password.hash` so that
 * the Worker runtime uses native `node:crypto.scrypt` instead of Better Auth's
 * generic pure-JavaScript fallback (`@noble/hashes/scryptAsync`).
 */
export function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(PASSWORD_SALT_BYTES).toString("hex");
    scrypt(
      password.normalize("NFKC"),
      salt,
      scryptConfig.dkLen,
      { N: scryptConfig.N, r: scryptConfig.r, p: scryptConfig.p, maxmem: scryptMaxmem },
      (err, derivedKey) => {
        if (err) return reject(err);
        resolve(`${salt}:${derivedKey.toString("hex")}`);
      },
    );
  });
}

/**
 * Verifies a password against a scrypt hash produced by {@link hashPassword}.
 *
 * The `hash` parameter is expected in `salt:derivedKey` hex format. Malformed
 * or truncated hashes return `false` rather than throwing. The incoming
 * password is NFKC-normalized to match the normalization applied during hashing.
 *
 * This is wired into Better Auth via `emailAndPassword.password.verify`.
 */
export function verifyPassword({
  hash,
  password,
}: {
  hash: string;
  password: string;
}): Promise<boolean> {
  return new Promise((resolve) => {
    const [salt, key] = hash.split(":");
    if (!salt || !key) {
      resolve(false);
      return;
    }
    scrypt(
      password.normalize("NFKC"),
      salt,
      scryptConfig.dkLen,
      { N: scryptConfig.N, r: scryptConfig.r, p: scryptConfig.p, maxmem: scryptMaxmem },
      (err, derivedKey) => {
        if (err) {
          resolve(false);
          return;
        }
        resolve(derivedKey.toString("hex") === key);
      },
    );
  });
}
