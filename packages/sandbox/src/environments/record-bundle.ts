import { db } from "@superset/db/client";
import { sandboxBundles } from "@superset/db/schema";
import { SANDBOX_IMAGE_NAME } from "@superset/shared/constants";

/** A bundle the release published; the newest row is what a new environment pins to. */
export async function recordReleasedBundle(args: {
	imageRef: string;
	bundleSha: string;
}): Promise<void> {
	await db
		.insert(sandboxBundles)
		.values({ sha: args.bundleSha, imageRef: args.imageRef })
		.onConflictDoNothing();
}

if (import.meta.main) {
	const bundleSha = process.argv[2];
	if (!/^[0-9a-f]{64}$/.test(bundleSha ?? "")) {
		console.error(
			"usage: bun run record-bundle <bundle sha256> [image ref]; a database with no released bundle cannot create environments",
		);
		process.exit(1);
	}
	const imageRef = process.argv[3] ?? SANDBOX_IMAGE_NAME;
	await recordReleasedBundle({ imageRef, bundleSha: bundleSha as string });
	console.log(`recorded bundle ${bundleSha} (${imageRef})`);
	process.exit(0);
}
