import { PAGE_MANIFESTS_JOB_MAX_PAGES } from "@superset/shared/page-storage-hub";
import { z } from "zod";
import { writePageManifest } from "./storage";

const CONCURRENCY = 8;

export const pageManifestsJobSchema = z.object({
	pageIds: z.array(z.string().uuid()).min(1).max(PAGE_MANIFESTS_JOB_MAX_PAGES),
});

/** Throws when any write fails, so QStash retries the whole job; each write is idempotent. */
export async function rewritePageManifests(
	pageIds: readonly string[],
): Promise<{ rewritten: number }> {
	let failed = 0;
	for (let index = 0; index < pageIds.length; index += CONCURRENCY) {
		const results = await Promise.allSettled(
			pageIds
				.slice(index, index + CONCURRENCY)
				.map((pageId) => writePageManifest(pageId)),
		);
		failed += results.filter((result) => result.status === "rejected").length;
	}
	if (failed > 0) {
		throw new Error(
			`${failed} of ${pageIds.length} page manifest(s) failed to rewrite`,
		);
	}
	return { rewritten: pageIds.length };
}
