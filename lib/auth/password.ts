import "server-only";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt-v1:${salt}:${(await derive(password, salt)).toString("hex")}`;
}

export async function verifyPassword(password: string, hash: string) {
  const [version, salt, expected] = hash.split(":");
  if (version !== "scrypt-v1" || !salt || !expected || expected.length !== 128) return false;
  const actual = await derive(password, salt);
  return timingSafeEqual(actual, Buffer.from(expected, "hex"));
}

// Always run the password KDF for unknown accounts as well.
export const DUMMY_PASSWORD_HASH = `scrypt-v1:${"0".repeat(32)}:${"0".repeat(128)}`;
