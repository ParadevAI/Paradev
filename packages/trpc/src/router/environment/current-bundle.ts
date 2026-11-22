import { db } from "@superset/db/client";
import { sandboxBundles } from "@superset/db/schema";
import { desc } from "drizzle-orm";

/** The bundle a new environment pins to: the newest the release published. */
export function newestBundleSha(rows: ReadonlyArray<{ sha: string }>): string {
	const newest = rows[0];
	if (!newest) {
		throw new Error(
			"No sandbox bundle has been released yet; sandbox_bundles is empty",
		);
	}
	return newest.sha;
}

export async function currentBundleSha(): Promise<string> {
	const rows = await db
		.select({ sha: sandboxBundles.sha })
		.from(sandboxBundles)
		.orderBy(desc(sandboxBundles.releasedAt))
		.limit(1);
	return newestBundleSha(rows);
}
