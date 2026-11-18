import { db } from "@superset/db/client";
import { cloudWorkspaces, environments } from "@superset/db/schema";
import { and, eq, isNull } from "drizzle-orm";

/**
 * Whether a workspace, in any status, or a live environment still names the
 * sandbox or the drive. Every real teardown clears the row's names in the
 * write that commits to it (retireAndTearDown), so a name still on a row is
 * that row's: an archived row may be undone onto it, and a failed one keeps
 * its box and drive for diagnosis with the work in them.
 */
export async function liveReferences(args: {
	providerSandboxId: string;
	driveName: string | null;
}): Promise<{ sandbox: boolean; drive: boolean }> {
	const [workspaceBox, goldenBox, workspaceDrive, goldenDrive] =
		await Promise.all([
			db
				.select({ id: cloudWorkspaces.id })
				.from(cloudWorkspaces)
				.where(eq(cloudWorkspaces.providerSandboxId, args.providerSandboxId))
				.limit(1),
			db
				.select({ id: environments.id })
				.from(environments)
				.where(
					and(
						eq(environments.sourceRef, args.providerSandboxId),
						isNull(environments.archivedAt),
					),
				)
				.limit(1),
			args.driveName
				? db
						.select({ id: cloudWorkspaces.id })
						.from(cloudWorkspaces)
						.where(eq(cloudWorkspaces.driveName, args.driveName))
						.limit(1)
				: [],
			args.driveName
				? db
						.select({ id: environments.id })
						.from(environments)
						.where(
							and(
								eq(environments.goldenDriveName, args.driveName),
								isNull(environments.archivedAt),
							),
						)
						.limit(1)
				: [],
		]);
	return {
		sandbox: workspaceBox.length > 0 || goldenBox.length > 0,
		drive: workspaceDrive.length > 0 || goldenDrive.length > 0,
	};
}
