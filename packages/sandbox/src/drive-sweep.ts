/**
 * Finds workspace and golden drives that nothing names any more: no
 * workspace row and no environment row, whatever its status, no sandbox
 * attached, and older than a safe age. Lists them; deletes them only with
 * --delete, and checks each again just before its delete.
 *
 *   bun run drive-sweep                        DATABASE_URL, dry run
 *   bun run drive-sweep --production           the production database
 *   bun run drive-sweep --production --delete  deletes what it lists
 *   --min-age-days <n>                         default 2
 *
 * Needs VERCEL_SANDBOX_TOKEN, VERCEL_SANDBOX_TEAM_ID and VERCEL_SANDBOX_PROJECT_ID.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
export const SWEPT_PREFIXES = ["drive-", "env-drive-"] as const;

export interface SweptDrive {
	name: string;
	createdAt: number;
	attachedTo?: string;
}

/**
 * A drive is a candidate when no row names it and no sandbox holds it, and
 * it is older than `minAgeMs`: a release writes its golden drive's name only
 * once the golden is built. A row that is really torn down has its names
 * cleared in the same write (retireAndTearDown), so any row that still names
 * a drive, archived or not, may still be undone onto it.
 */
export function orphanCandidates(args: {
	drives: SweptDrive[];
	named: ReadonlySet<string>;
	now: number;
	minAgeMs: number;
}): SweptDrive[] {
	return args.drives.filter(
		(drive) =>
			SWEPT_PREFIXES.some((prefix) => drive.name.startsWith(prefix)) &&
			!args.named.has(drive.name) &&
			!drive.attachedTo &&
			args.now - drive.createdAt > args.minAgeMs,
	);
}

export interface SweepHost {
	listDrives(): Promise<SweptDrive[]>;
	namedDrives(): Promise<ReadonlySet<string>>;
	/** Read at delete time, not from the list: an unarchive may have named or mounted it since. */
	stillOrphaned(name: string): Promise<boolean>;
	remove(name: string): Promise<void>;
}

export async function sweepDrives(args: {
	host: SweepHost;
	now: number;
	minAgeMs: number;
	remove: boolean;
	log: (line: string) => void;
}): Promise<{ candidates: number; deleted: number; failed: number }> {
	const drives = await args.host.listDrives();
	const candidates = orphanCandidates({
		drives,
		named: await args.host.namedDrives(),
		now: args.now,
		minAgeMs: args.minAgeMs,
	});
	args.log(`${drives.length} drives listed, ${candidates.length} orphaned`);
	let deleted = 0;
	let failed = 0;
	for (const drive of candidates) {
		const age = ((args.now - drive.createdAt) / DAY_MS).toFixed(1);
		if (!args.remove) {
			args.log(`would delete ${drive.name} (${age} days old)`);
			continue;
		}
		try {
			if (!(await args.host.stillOrphaned(drive.name))) {
				args.log(
					`kept ${drive.name}: a row names it or a sandbox holds it now`,
				);
				continue;
			}
			await args.host.remove(drive.name);
			deleted++;
			args.log(`deleted ${drive.name} (${age} days old)`);
		} catch (error) {
			failed++;
			args.log(`::warning::could not delete ${drive.name}: ${error}`);
		}
	}
	if (!args.remove && candidates.length) {
		args.log("dry run: pass --delete to delete");
	}
	return { candidates: candidates.length, deleted, failed };
}

if (import.meta.main) {
	const argv = process.argv.slice(2);
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
	const { eq, isNotNull } = await import("drizzle-orm");
	const { Drive } = await import("@vercel/sandbox");

	const named = async (name: string) =>
		(
			await Promise.all([
				db
					.select({ id: cloudWorkspaces.id })
					.from(cloudWorkspaces)
					.where(eq(cloudWorkspaces.driveName, name))
					.limit(1),
				db
					.select({ id: environments.id })
					.from(environments)
					.where(eq(environments.goldenDriveName, name))
					.limit(1),
			])
		).some((rows) => rows.length > 0);
	const host: SweepHost = {
		async listDrives() {
			const drives = new Map<string, SweptDrive>();
			for (const prefix of SWEPT_PREFIXES) {
				for await (const drive of await Drive.list({
					...credentials,
					namePrefix: prefix,
					sortBy: "name",
				})) {
					drives.set(drive.name, {
						name: drive.name,
						createdAt: drive.createdAt.getTime(),
						attachedTo: drive.currentSandboxName,
					});
				}
			}
			return [...drives.values()];
		},
		async namedDrives() {
			const [workspaces, goldens] = await Promise.all([
				db
					.select({ name: cloudWorkspaces.driveName })
					.from(cloudWorkspaces)
					.where(isNotNull(cloudWorkspaces.driveName)),
				db
					.select({ name: environments.goldenDriveName })
					.from(environments)
					.where(isNotNull(environments.goldenDriveName)),
			]);
			return new Set(
				[...workspaces, ...goldens].flatMap((row) =>
					row.name ? [row.name] : [],
				),
			);
		},
		async stillOrphaned(name) {
			if (await named(name)) return false;
			const drive = await Drive.get({ ...credentials, name });
			return !drive.currentSandboxName;
		},
		async remove(name) {
			await (await Drive.get({ ...credentials, name })).delete();
		},
	};
	const { failed } = await sweepDrives({
		host,
		now: Date.now(),
		minAgeMs: minAgeDays * DAY_MS,
		remove: argv.includes("--delete"),
		log: console.log,
	});
	process.exit(failed ? 1 : 0);
}
