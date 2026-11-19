/**
 * What the cleanup job's next run would do, against a real database and the
 * real Vercel listing, with nothing written or deleted. Runs the job itself
 * (listing checks included) with `dryRun`, then reports each rule's
 * decisions grouped by kind, action and reason.
 *
 * Four guards keep it from deleting anything:
 * 1. it refuses unless DATABASE_URL logs in as the `readonly` role, so no row can change;
 * 2. VERCEL_ENV is set to "development" before anything loads, so `sandboxDeletesAllowed` refuses;
 * 3. every SDK call that stops, updates, creates or deletes a box or drive throws;
 * 4. the job runs with `dryRun`, which replaces every writing or deleting dependency.
 *
 * Usage: DATABASE_URL=<readonly role> VERCEL_SANDBOX_TOKEN=… VERCEL_SANDBOX_TEAM_ID=… \
 *   VERCEL_SANDBOX_PROJECT_ID=… bun run packages/trpc/scripts/cleanup-dry-run.ts [--json out.json]
 */

const databaseUrl = process.env.DATABASE_URL ?? "";
let role = "";
try {
	role = decodeURIComponent(new URL(databaseUrl).username);
} catch {}
if (role !== "readonly") {
	console.error(
		`DATABASE_URL must log in as the readonly role, not "${role || "none"}"`,
	);
	process.exit(64);
}
for (const key of [
	"VERCEL_SANDBOX_TOKEN",
	"VERCEL_SANDBOX_TEAM_ID",
	"VERCEL_SANDBOX_PROJECT_ID",
]) {
	if (!process.env[key]) {
		console.error(`${key} is required`);
		process.exit(64);
	}
}
process.env.VERCEL_ENV = "development";
process.env.SKIP_ENV_VALIDATION = "1";
process.env.DATABASE_URL_UNPOOLED = databaseUrl;

const { Drive, Sandbox } = await import("@vercel/sandbox");
const trap = (what: string) => () => {
	throw new Error(`dry run reached ${what}`);
};
const trapped: Array<[object, string]> = [
	[Sandbox.prototype, "delete"],
	[Sandbox.prototype, "stop"],
	[Sandbox.prototype, "update"],
	[Sandbox, "create"],
	[Drive.prototype, "delete"],
	[Drive, "getOrCreate"],
];
for (const [target, key] of trapped) {
	Object.defineProperty(target, key, {
		value: trap(key),
		configurable: false,
		writable: false,
	});
}

const { db } = await import("@superset/db/client");
const { cloudWorkspaces, environments, organizations } = await import(
	"@superset/db/schema"
);
const { count, inArray } = await import("drizzle-orm");
const retention = await import("../src/router/cloud-workspace/retention");
type Deps = import("../src/router/cloud-workspace/retention").RetentionDeps;
type ListedSandbox = import("../src/lib/sandbox").ListedSandbox;
type ListedDrive = import("../src/lib/sandbox").ListedDrive;

const now = Date.now();
let boxes: ListedSandbox[] = [];
let drives: ListedDrive[] = [];
const rows = new Map<string, { createdAt: Date; status: string }>();
const lines: string[] = [];

const base = retention.defaultRetentionDeps;
const deps: Deps = {
	...base,
	listSandboxes: async (expected) => {
		boxes = await base.listSandboxes(expected);
		return boxes;
	},
	listDrives: async () => {
		drives = await base.listDrives();
		return drives;
	},
	findPastWait: async (args) => {
		const found = await base.findPastWait(args);
		for (const row of found) rows.set(row.id, row);
		return found;
	},
	log: (line) => lines.push(line),
};

const result = await retention.reapCloudWorkspaceRetention({
	now,
	production: true,
	deps,
	dryRun: true,
});

type Decision = {
	rule: number;
	kind: string;
	name: string;
	action: string;
	reason: string;
};
const decisions: Decision[] = lines
	.filter((line) => line.startsWith("[cleanup] {"))
	.map((line) => JSON.parse(line.slice("[cleanup] ".length)));
const reached = decisions.filter((d) => d.action === "delete");
if (reached.length) throw new Error("dry run logged a real delete");

const boxByName = new Map(boxes.map((box) => [box.name, box]));
const driveByName = new Map(drives.map((drive) => [drive.name, drive]));
const createdAt = (d: Decision): number | null => {
	if (d.kind === "workspace") {
		const id = d.name.split(" ")[0] ?? "";
		return rows.get(id)?.createdAt.getTime() ?? null;
	}
	if (d.kind === "drive" || d.kind === "agents drive") {
		return driveByName.get(d.name)?.createdAt ?? null;
	}
	return boxByName.get(d.name)?.createdAt ?? null;
};
const iso = (ms: number | null) => (ms ? new Date(ms).toISOString() : "?");

// Rule 1's select is capped at a batch; count everything past its wait too.
const pastWait = await db
	.select({ status: cloudWorkspaces.status, n: count() })
	.from(cloudWorkspaces)
	.where(
		retention.waitOverWhere({ now, listedNames: boxes.map((b) => b.name) }),
	)
	.groupBy(cloudWorkspaces.status);

// Where an unnamed box came from: a production row, or a database that is not production.
const unnamed = decisions.filter(
	(d) => d.rule === 3 && d.kind === "box" && d.action === "would delete",
);
const tagged = (key: string) => [
	...new Set(
		unnamed.flatMap((d) => {
			const value = boxByName.get(d.name)?.tags[key];
			return value ? [value] : [];
		}),
	),
];
const knownWorkspaces = new Set<string>();
for (let i = 0; i < tagged("workspace").length; i += 500) {
	for (const row of await db
		.select({ id: cloudWorkspaces.id })
		.from(cloudWorkspaces)
		.where(
			inArray(cloudWorkspaces.id, tagged("workspace").slice(i, i + 500)),
		)) {
		knownWorkspaces.add(row.id);
	}
}
const knownOrgs = new Set<string>();
for (let i = 0; i < tagged("org").length; i += 500) {
	for (const row of await db
		.select({ id: organizations.id })
		.from(organizations)
		.where(inArray(organizations.id, tagged("org").slice(i, i + 500)))) {
		knownOrgs.add(row.id);
	}
}
const originOf = (name: string): string => {
	const tags = boxByName.get(name)?.tags ?? {};
	if (!tags.kind) return "untagged (made before tags, or not by the API)";
	if (tags.workspace && knownWorkspaces.has(tags.workspace)) {
		return "its production workspace row names another box now";
	}
	if (tags.org && !knownOrgs.has(tags.org)) {
		return "organization not in production: a preview's or dev's, or deleted";
	}
	if (tags.workspace) {
		return "workspace not in production: made by a preview or dev database, or its row was deleted";
	}
	return `kind ${tags.kind}, no production row`;
};

const envRows = await db
	.select({
		id: environments.id,
		name: environments.name,
		sourceRef: environments.sourceRef,
		archivedAt: environments.archivedAt,
	})
	.from(environments);
const envByRef = new Map(envRows.map((env) => [env.sourceRef, env]));

const groups = new Map<string, Decision[]>();
for (const d of decisions) {
	const key = `${d.rule}|${d.kind}|${d.action}|${d.reason}`;
	groups.set(key, [...(groups.get(key) ?? []), d]);
}
const report = [...groups.entries()]
	.map(([key, items]) => {
		const [rule = "", kind = "", action = "", reason = ""] = key.split("|");
		const sorted = [...items].sort(
			(a, b) => (createdAt(a) ?? Infinity) - (createdAt(b) ?? Infinity),
		);
		const oldest = sorted[0];
		return {
			rule: Number(rule),
			kind,
			action,
			reason,
			count: items.length,
			examples: items.slice(0, 5).map((d) => d.name),
			oldest: oldest
				? { name: oldest.name, createdAt: iso(createdAt(oldest)) }
				: null,
		};
	})
	.sort(
		(a, b) =>
			a.rule - b.rule ||
			a.kind.localeCompare(b.kind) ||
			a.action.localeCompare(b.action) ||
			b.count - a.count,
	);

const wouldDelete = decisions.filter((d) => d.action === "would delete");
const running = new Set(["pending", "running"]);
const flags = {
	runningNowAmongDeletes: wouldDelete
		.filter((d) => {
			const name =
				d.kind === "workspace" ? d.name.match(/\((.*)\)$/)?.[1] : d.name;
			return name && running.has(boxByName.get(name)?.status ?? "");
		})
		.map((d) => `${d.rule}:${d.kind}:${d.name}`),
	runningNowListed: boxes.filter((box) => running.has(box.status)).length,
	environmentGoldensAmongDeletes: wouldDelete
		.filter((d) => envByRef.has(d.name))
		.map((d) => {
			const env = envByRef.get(d.name);
			return `${d.name} (${env?.name}${env?.archivedAt ? ", archived" : ""})`;
		}),
	internalGoldens: envRows
		.filter((env) => /superset/i.test(env.name))
		.map((env) => ({
			environment: env.name,
			golden: env.sourceRef,
			decision:
				decisions.find((d) => d.name === env.sourceRef)?.action ?? "not listed",
		})),
	workspaceDrivesLike9847: drives
		.filter((d) => /^(env-)?drive-/.test(d.name))
		.map((d) => ({
			name: d.name,
			createdAt: iso(d.createdAt),
			decision: decisions.find((x) => x.name === d.name)?.action ?? "none",
		})),
	unnamedBoxOrigins: Object.entries(
		unnamed.reduce<Record<string, number>>((acc, d) => {
			const origin = originOf(d.name);
			acc[origin] = (acc[origin] ?? 0) + 1;
			return acc;
		}, {}),
	),
};

const summary = {
	ranAt: new Date(now).toISOString(),
	listed: { boxes: boxes.length, drives: drives.length },
	result,
	rule1PastWaitInTotal: Object.fromEntries(
		pastWait.map((row) => [row.status, row.n]),
	),
	report,
	flags,
};
const jsonAt = process.argv.indexOf("--json");
if (jsonAt > 0 && process.argv[jsonAt + 1]) {
	const { writeFile } = await import("node:fs/promises");
	await writeFile(
		process.argv[jsonAt + 1] as string,
		JSON.stringify(summary, null, 2),
	);
}
console.log(JSON.stringify(summary, null, 2));
process.exit(0);
