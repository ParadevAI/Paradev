import {
	PAGE_MANIFESTS_JOB_PATH,
	type PageManifestsJob,
} from "@superset/shared/page-storage-hub";
import { Client } from "@upstash/qstash";
import { env } from "../env";

/**
 * Asks the API to rewrite these pages' manifests after their shares changed
 * outside the sharing router, so the realtime hub stops (or starts) admitting
 * the people concerned. Best effort: a failure is logged, not thrown.
 */
export async function enqueuePageManifestRewrite(
	pageIds: readonly string[],
): Promise<void> {
	if (pageIds.length === 0) return;
	const url = `${env.NEXT_PUBLIC_API_URL}${PAGE_MANIFESTS_JOB_PATH}`;
	const body: PageManifestsJob = { pageIds: [...pageIds] };
	try {
		// QStash cannot reach a local API; the route skips the signature check in development.
		if (process.env.NODE_ENV === "development") {
			await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			return;
		}
		await new Client({ token: env.QSTASH_TOKEN }).publishJSON({
			url,
			body,
			retries: 3,
		});
	} catch (error) {
		console.error("[pages] failed to queue a manifest rewrite", {
			pageIds,
			error,
		});
	}
}
