/**
 * The cleanup job's next run, with `dryRun`: reads production, writes and deletes nothing.
 * Guards besides `dryRun`: only the `readonly` database role; VERCEL_ENV is not production;
 * the SDK's stop, update, create and delete throw.
 *
 * Usage: DATABASE_URL=<readonly role> VERCEL_SANDBOX_TOKEN=… VERCEL_SANDBOX_TEAM_ID=… \
 *   VERCEL_SANDBOX_PROJECT_ID=… bun run packages/trpc/scripts/cleanup-dry-run.ts
 */
const url = new URL(process.env.DATABASE_URL || "postgres://none@x");
if (decodeURIComponent(url.username) !== "readonly") {
	console.error("DATABASE_URL must log in as the readonly role");
	process.exit(64);
}
process.env.VERCEL_ENV = "development";
process.env.SKIP_ENV_VALIDATION = "1";
const { Drive, Sandbox } = await import("@vercel/sandbox");
for (const [target, key] of [
	[Sandbox.prototype, "delete"],
	[Sandbox.prototype, "stop"],
	[Sandbox.prototype, "update"],
	[Sandbox, "create"],
	[Drive.prototype, "delete"],
	[Drive, "getOrCreate"],
] as const) {
	Object.defineProperty(target, key, {
		value: () => {
			throw new Error(`dry run reached ${key}`);
		},
	});
}
const retention = await import("../src/router/cloud-workspace/retention");
const base = retention.defaultRetentionDeps;
const made = new Map<string, number>();
const groups = new Map<
	string,
	{ count: number; examples: string[]; oldest?: string }
>();
const age = (name: string) =>
	made.get(name.match(/\((.*)\)$/)?.[1] ?? name) ?? Infinity;
const seen = <T extends { name: string; createdAt: number }>(items: T[]) => {
	for (const item of items) made.set(item.name, item.createdAt);
	return items;
};
const result = await retention.reapCloudWorkspaceRetention({
	production: true,
	dryRun: true,
	deps: {
		...base,
		listSandboxes: async (expected) => seen(await base.listSandboxes(expected)),
		listDrives: async () => seen(await base.listDrives()),
		log: (line) => {
			if (!line.startsWith("[cleanup] {")) return console.log(line);
			const d = JSON.parse(line.slice(10));
			if (d.action === "delete") throw new Error("dry run logged a delete");
			const key = `rule ${d.rule} | ${d.kind} | ${d.action} | ${d.reason}`;
			const g = groups.get(key) ?? { count: 0, examples: [] };
			g.count++;
			if (g.examples.length < 5) g.examples.push(d.name);
			if (!g.oldest || age(d.name) < age(g.oldest)) g.oldest = d.name;
			groups.set(key, g);
		},
	},
});
console.log(
	JSON.stringify({ result, groups: Object.fromEntries(groups) }, null, 2),
);
