// Prints the two .env.local lines that enable developer access to /preview.
// Reads the password from stdin so it never appears in shell history or argv:
//   printf '%s' "$PASSWORD" | node scripts/preview-access-env.mjs
// Same KDF parameters as lib/auth/password.ts.
import { randomBytes, scrypt } from "node:crypto";

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const password = Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
if (password.length < 10) { console.error("Password must be at least 10 characters."); process.exit(1); }

const salt = randomBytes(16).toString("hex");
const key = await new Promise((resolve, reject) => scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, derived) => error ? reject(error) : resolve(derived)));
console.log(`PREVIEW_PASSWORD_HASH=scrypt-v1:${salt}:${key.toString("hex")}`);
console.log(`PREVIEW_SESSION_SECRET=${randomBytes(32).toString("base64url")}`);
