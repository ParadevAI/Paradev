import { db } from "@superset/db/client";
import { githubInstallations } from "@superset/db/schema";
import { eq } from "drizzle-orm";

interface SaveInstallationInput {
	organizationId: string;
	userId: string;
	installationId: string;
	accountLogin: string;
	accountType: string;
	permissions: Record<string, string>;
}

/** Undefined when another organization owns the installation. */
export async function saveInstallation({
	organizationId,
	userId,
	installationId,
	...account
}: SaveInstallationInput) {
	const fields = {
		...account,
		connectedByUserId: userId,
		suspended: false,
		suspendedAt: null,
	};
	const [saved] = await db
		.insert(githubInstallations)
		.values({ ...fields, organizationId, installationId })
		.onConflictDoUpdate({
			target: [githubInstallations.installationId],
			set: { ...fields, updatedAt: new Date() },
			setWhere: eq(githubInstallations.organizationId, organizationId),
		})
		.returning();
	return saved;
}
