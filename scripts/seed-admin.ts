/**
 * Seed an admin user into the Convex database.
 *
 * Usage:
 *   npx tsx scripts/seed-admin.ts
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import bcrypt from "bcryptjs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

// Load .env.local since tsx doesn't do it automatically
const envPath = resolve(__dirname, "..", ".env.local");
for (const line of readFileSync(envPath, "utf-8").split("\n")) {
  const match = line.match(/^\s*([\w.]+)\s*=\s*(.*)$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].trim();
  }
}

const ADMIN_EMAIL = "daniel@dreamfree.co.uk";
const ADMIN_PASSWORD = "changeme123"; // Change this after first login

async function main() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    console.error("Set NEXT_PUBLIC_CONVEX_URL in .env.local");
    process.exit(1);
  }

  const convex = new ConvexHttpClient(url);

  const existing = await convex.query(api.users.getByEmail, {
    email: ADMIN_EMAIL,
  });

  if (existing) {
    console.log(`Admin user ${ADMIN_EMAIL} already exists.`);
    return;
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  await convex.mutation(api.users.createUser, {
    email: ADMIN_EMAIL,
    passwordHash,
    isAdmin: true,
  });

  console.log(`Admin user ${ADMIN_EMAIL} created successfully.`);
  console.log("Default password: changeme123 — change it after first login.");
}

main().catch(console.error);
