import { randomBytes, scrypt } from "node:crypto";

const scryptConfig = { N: 16384, r: 16, p: 1, dkLen: 64 } as const;
const scryptMaxmem = 128 * scryptConfig.N * scryptConfig.r * 2;

export function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(16).toString("hex");
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
