/**
 * Idempotent: ensure a QStash schedule pings the automations evaluator every
 * minute. Re-running is a no-op if a schedule already targets the same URL.
 *
 * Usage:
 *   NEXT_PUBLIC_API_URL=https://api.superset.sh \
 *   QSTASH_TOKEN=... \
 *   bun run apps/api/scripts/setup-automations-schedule.ts
 */
import { Client } from "@upstash/qstash";

const token = process.env.QSTASH_TOKEN;
const apiUrl = process.env.NEXT_PUBLIC_API_URL;

if (!token) throw new Error("QSTASH_TOKEN is required");
if (!apiUrl) throw new Error("NEXT_PUBLIC_API_URL is required");

const destination = `${apiUrl}/api/automations/evaluate`;
const cron = "* * * * *";
const qstash = new Client({ token });

const existing = await qstash.schedules.list();
const match = existing.find((s) => s.destination === destination);
if (match) {
	console.log(`Schedule already exists: ${match.scheduleId} → ${destination}`);
	process.exit(0);
}

const scheduleId = await qstash.schedules.create({ destination, cron });
console.log(`Created schedule ${scheduleId} → ${destination}`);
