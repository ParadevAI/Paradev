import { db } from "@superset/db/client";
import { subscriptions } from "@superset/db/schema";
import { ACTIVE_SUBSCRIPTION_STATUSES } from "@superset/shared/billing";
import { inArray } from "drizzle-orm";
import { seedGrantState } from "../src/lib/billing/autumn/projection";

const apply = process.argv.includes("--apply");

async function main() {
	const rows = await db
		.selectDistinct({ organizationId: subscriptions.referenceId })
		.from(subscriptions)
		.where(inArray(subscriptions.status, [...ACTIVE_SUBSCRIPTION_STATUSES]));

	if (!apply) {
		console.log(
			`[seed-grant-state] would record the GB-minute grant of ${rows.length} paying organizations; pass --apply to write.`,
		);
		return;
	}

	const counts = { seeded: 0, exists: 0, "no-grant": 0, failed: 0 };
	for (const { organizationId } of rows) {
		try {
			counts[await seedGrantState(organizationId)] += 1;
		} catch (error) {
			counts.failed += 1;
			console.error(`[seed-grant-state] ${organizationId} failed`, error);
		}
	}
	console.log(
		`[seed-grant-state] seeded ${counts.seeded}, already recorded ${counts.exists}, no monthly grant ${counts["no-grant"]}, failed ${counts.failed}, of ${rows.length} organizations.`,
	);
	if (counts.failed > 0) process.exitCode = 1;
}

await main();
