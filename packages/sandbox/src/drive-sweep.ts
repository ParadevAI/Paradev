/**
 * Finds workspace and golden drives that nothing names any more: no
 * workspace row, no live environment, no sandbox attached, and older than a
 * safe age. Lists them; deletes them only with --delete.
 *
 *   bun run drive-sweep                        DATABASE_URL, dry run
 *   bun run drive-sweep --production           the production database
 *   bun run drive-sweep --production --delete  deletes what it lists
 *   --min-age-days <n>                         default 2
 *
 * Needs VERCEL_SANDBOX_TOKEN, VERCEL_SANDBOX_TEAM_ID and VERCEL_SANDBOX_PROJECT_ID.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** An archived workspace keeps its drive this long, so an unarchive finds it. */
const ARCHIVE_GRACE_MS = 7 * DAY_MS;
export const SWEPT_PREFIXES = ["drive-", "env-drive-"] as const;

export interface SweptDrive {
	name: string;
	createdAt: number;
	attachedTo?: string;
}

export interface DriveOwners {
	workspaces: Array<{
		driveName: string;
		status: string;
		deletedAt: Date | null;
	}>;
	/** Golden drives of environments that are not archived. */
	liveGoldens: string[];
}

/**
 * A drive is an orphan when no workspace still owns it (live, or archived
 * within its grace period), no live environment names it, no sandbox holds
 * it, and it is older than `minAgeMs`: a release writes its golden drive's
 * name only once the golden is built.
 */
export function orphanDrives(args: {
	drives: SweptDrive[];
	owners: DriveOwners;
	now: number;
	minAgeMs: number;
}): SweptDrive[] {
	const owned = new Set(args.owners.liveGoldens);
	for (const workspace of args.owners.workspaces) {
		const released =
			workspace.status === "archived" &&
			workspace.deletedAt !== null &&
			args.now - workspace.deletedAt.getTime() > ARCHIVE_GRACE_MS;
		if (!released) owned.add(workspace.driveName);
	}
	return args.drives.filter(
		(drive) =>
			SWEPT_PREFIXES.some((prefix) => drive.name.startsWith(prefix)) &&
			!owned.has(drive.name) &&
			!drive.attachedTo &&
			args.now - drive.createdAt > args.minAgeMs,
	);
}

if (import.meta.main) {
	const argv = process.argv.slice(2);
	const remove = argv.includes("--delete");
	const ageFlag = argv.indexOf("--min-age-days");
	const minAgeDays = ageFlag >= 0 ? Number(argv[ageFlag + 1]) : 2;
	const credentials = {
		token: process.env.VERCEL_SANDBOX_TOKEN ?? "",
		teamId: process.env.VERCEL_SANDBOX_TEAM_ID ?? "",
		projectId: process.env.VERCEL_SANDBOX_PROJECT_ID ?? "",
	};
	if (!credentials.token || !credentials.teamId || !credentials.projectId) {
		console.error(
			"VERCEL_SANDBOX_TOKEN, VERCEL_SANDBOX_TEAM_ID and VERCEL_SANDBOX_PROJECT_ID are required",
		);
		process.exit(64);
	}
	if (!Number.isFinite(minAgeDays) || minAgeDays < 1) {
		console.error("--min-age-days must be at least 1");
		process.exit(64);
	}
	if (argv.includes("--production")) {
		const { useProductionDatabase } = await import(
			"./environments/production-database"
		);
		console.log(`database: Neon branch ${await useProductionDatabase()}`);
	} else if (!process.env.DATABASE_URL) {
		console.error("DATABASE_URL is required (or pass --production)");
		process.exit(64);
	}
	process.env.SKIP_ENV_VALIDATION ??= "1";
	const { db } = await import("@superset/db/client");
	const { cloudWorkspaces, environments } = await import("@superset/db/schema");
	const { and, isNotNull, isNull } = await import("drizzle-orm");
	const { Drive } = await import("@vercel/sandbox");

	const drives: SweptDrive[] = [];
	for (const prefix of SWEPT_PREFIXES) {
		for await (const drive of await Drive.list({
			...credentials,
			namePrefix: prefix,
			sortBy: "name",
		})) {
			drives.push({
				name: drive.name,
				createdAt: drive.createdAt.getTime(),
				attachedTo: drive.currentSandboxName,
			});
		}
	}
	const workspaces = await db
		.select({
			driveName: cloudWorkspaces.driveName,
			status: cloudWorkspaces.status,
			deletedAt: cloudWorkspaces.deletedAt,
		})
		.from(cloudWorkspaces)
		.where(isNotNull(cloudWorkspaces.driveName));
	const goldens = await db
		.select({ name: environments.goldenDriveName })
		.from(environments)
		.where(
			and(
				isNotNull(environments.goldenDriveName),
				isNull(environments.archivedAt),
			),
		);
	const orphans = orphanDrives({
		drives: [...new Map(drives.map((drive) => [drive.name, drive])).values()],
		owners: {
			workspaces: workspaces.flatMap((row) =>
				row.driveName ? [{ ...row, driveName: row.driveName }] : [],
			),
			liveGoldens: goldens.flatMap((row) => (row.name ? [row.name] : [])),
		},
		now: Date.now(),
		minAgeMs: minAgeDays * DAY_MS,
	});
	console.log(
		`${drives.length} drives listed, ${orphans.length} orphaned (older than ${minAgeDays} days)`,
	);
	let failed = 0;
	for (const drive of orphans) {
		const age = ((Date.now() - drive.createdAt) / DAY_MS).toFixed(1);
		if (!remove) {
			console.log(`would delete ${drive.name} (${age} days old)`);
			continue;
		}
		try {
			await (await Drive.get({ ...credentials, name: drive.name })).delete();
			console.log(`deleted ${drive.name} (${age} days old)`);
		} catch (error) {
			failed++;
			console.log(`::warning::could not delete ${drive.name}: ${error}`);
		}
	}
	if (!remove && orphans.length)
		console.log("dry run: pass --delete to delete");
	process.exit(failed ? 1 : 0);
}
