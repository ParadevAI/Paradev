import { z } from "zod";
import { writePageManifest } from "./storage";

export const pageManifestsJobSchema = z.object({
	pageIds: z.array(z.string().uuid()).min(1).max(1000),
});

/** Throws when any write fails, so QStash retries the whole job; each write is idempotent. */
export async function rewritePageManifests(
	pageIds: readonly string[],
): Promise<{ rewritten: number }> {
	const results = await Promise.allSettled(
		pageIds.map((pageId) => writePageManifest(pageId)),
	);
	const failed = results.filter((result) => result.status === "rejected");
	if (failed.length > 0) {
		throw new Error(
			`${failed.length} of ${pageIds.length} page manifest(s) failed to rewrite`,
		);
	}
	return { rewritten: pageIds.length };
}
