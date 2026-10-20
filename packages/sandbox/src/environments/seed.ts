import { db } from "@superset/db/client";
import {
	environments,
	organizations,
	sandboxBundles,
} from "@superset/db/schema";
import {
	SANDBOX_IMAGE_NAME,
	SHARED_ENVIRONMENT_NAME,
	SHARED_ENVIRONMENT_ORGANIZATION_ID,
} from "@superset/shared/constants";
import { and, eq } from "drizzle-orm";

const SHARED_ORGANIZATION = {
	id: SHARED_ENVIRONMENT_ORGANIZATION_ID,
	name: "Superset",
	slug: "superset-shared-environments",
} as const;

export async function seedSharedEnvironments(args: {
	imageRef: string;
	bundleSha: string;
}): Promise<{ imageRef: string }> {
	await db
		.insert(organizations)
		.values(SHARED_ORGANIZATION)
		.onConflictDoNothing({ target: organizations.id });
	await db
		.insert(sandboxBundles)
		.values({ sha: args.bundleSha, imageRef: args.imageRef })
		.onConflictDoNothing();

	const shared = await db.query.environments.findFirst({
		where: and(
			eq(environments.organizationId, SHARED_ENVIRONMENT_ORGANIZATION_ID),
			eq(environments.name, SHARED_ENVIRONMENT_NAME),
		),
		columns: { id: true },
	});
	if (shared) {
		await db
			.update(environments)
			.set({
				provider: "vercel",
				sourceRef: args.imageRef,
				bundleSha: args.bundleSha,
				archivedAt: null,
			})
			.where(eq(environments.id, shared.id));
	} else {
		await db.insert(environments).values({
			organizationId: SHARED_ENVIRONMENT_ORGANIZATION_ID,
			name: SHARED_ENVIRONMENT_NAME,
			provider: "vercel",
			sourceKind: "image",
			sourceRef: args.imageRef,
			bundleSha: args.bundleSha,
		});
	}

	return { imageRef: args.imageRef };
}

if (import.meta.main) {
	const bundleSha = process.argv[2];
	if (!/^[0-9a-f]{64}$/.test(bundleSha ?? "")) {
		console.error(
			"usage: bun run seed <bundle sha256> [image ref]; a database with no released bundle cannot create environments",
		);
		process.exit(1);
	}
	const { imageRef } = await seedSharedEnvironments({
		imageRef: process.argv[3] ?? SANDBOX_IMAGE_NAME,
		bundleSha: bundleSha as string,
	});
	console.log(`seeded shared environment -> ${imageRef}`);
	process.exit(0);
}
