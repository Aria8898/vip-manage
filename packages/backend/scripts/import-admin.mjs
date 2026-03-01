#!/usr/bin/env node

import { pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

const ITERATIONS = 210_000;
const KEY_LENGTH = 32;
const DIGEST = "sha256";
const DEFAULT_DB_BINDING = "DB";

const toBase64 = (buffer) => Buffer.from(buffer).toString("base64");

const buildPasswordHash = (password) => {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST);
  return `pbkdf2$sha256$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
};

const getArgValue = (args, flag) => {
  const index = args.indexOf(flag);
  if (index === -1 || index + 1 >= args.length) {
    return null;
  }
  return args[index + 1];
};

const hasFlag = (args, flag) => args.includes(flag);

const args = process.argv.slice(2);
const username = getArgValue(args, "--username");
const password = getArgValue(args, "--password");
const dbBinding = getArgValue(args, "--db") ?? DEFAULT_DB_BINDING;
const target = getArgValue(args, "--target");
const adminId = getArgValue(args, "--id") ?? randomUUID();
const printOnly = hasFlag(args, "--print-only");

if (!username || !password) {
  console.error(
    "Usage: pnpm --filter @vip/backend admin:import -- --username <name> --password <password> [--target local|remote] [--db DB] [--id <uuid>] [--print-only]"
  );
  process.exit(1);
}

if (target && target !== "local" && target !== "remote") {
  console.error("--target only supports local or remote");
  process.exit(1);
}

const passwordHash = buildPasswordHash(password);
const escapedUsername = username.replace(/'/g, "''");
const escapedHash = passwordHash.replace(/'/g, "''");
const escapedId = adminId.replace(/'/g, "''");
const sql = `INSERT INTO admin_users (id, username, password_hash, created_at)
VALUES ('${escapedId}', '${escapedUsername}', '${escapedHash}', unixepoch())
ON CONFLICT(username) DO UPDATE SET
  password_hash = excluded.password_hash;`;

console.log("Generated admin import SQL:");
console.log(sql);

if (printOnly || !target) {
  console.log(
    "\nTip: add --target local or --target remote to apply the SQL with wrangler d1 execute."
  );
  process.exit(0);
}

const commandArgs = [
  "exec",
  "wrangler",
  "d1",
  "execute",
  dbBinding,
  `--${target}`,
  "--command",
  sql
];

const result = spawnSync("pnpm", commandArgs, {
  stdio: "inherit"
});

if (typeof result.status === "number") {
  process.exit(result.status);
}

process.exit(1);
