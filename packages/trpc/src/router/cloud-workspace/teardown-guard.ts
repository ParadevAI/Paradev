import { db } from "@superset/db/client";
import { cloudWorkspaces, environments } from "@superset/db/schema";
import { and, eq, isNull, notInArray } from "drizzle-orm";

/** A workspace in these states lets its box and drive go; any other names them as its own. */
const RELEASED = ["archived", "failed"] as const;

/**
 * Whether a workspace or an environment still names the sandbox or the drive.
 * An unarchive reuses both names, so a teardown queued before it must not
 * delete what the revived workspace now runs on.
 */
export async function liveReferences(args: {
	providerSandboxId: string;
	driveName: string | null;
}): Promise<{ sandbox: boolean; drive: boolean }> {
	const live = notInArray(cloudWorkspaces.status, [...RELEASED]);
	const [workspaceBox, goldenBox, workspaceDrive, goldenDrive] =
		await Promise.all([
			db
				.select({ id: cloudWorkspaces.id })
				.from(cloudWorkspaces)
				.where(
					and(
						eq(cloudWorkspaces.providerSandboxId, args.providerSandboxId),
						live,
					),
				)
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
						.where(and(eq(cloudWorkspaces.driveName, args.driveName), live))
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
