import { db } from "@superset/db/client";
import { githubInstallations } from "@superset/db/schema";
import { asc, eq } from "drizzle-orm";

/** Active installations first, then the oldest, so a single pick is stable. */
export function organizationInstallations(organizationId: string) {
	return db.query.githubInstallations.findMany({
		where: eq(githubInstallations.organizationId, organizationId),
		columns: {
			id: true,
			installationId: true,
			accountLogin: true,
			accountType: true,
			suspended: true,
			lastSyncedAt: true,
			createdAt: true,
		},
		orderBy: [
			asc(githubInstallations.suspended),
			asc(githubInstallations.createdAt),
			asc(githubInstallations.id),
		],
	});
}
