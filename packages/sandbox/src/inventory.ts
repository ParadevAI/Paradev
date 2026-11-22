/**
 * Lists every snapshot the sandbox project stores, joined to the sandbox
 * whose current snapshot it is, and prints how much disk they hold.
 *
 *   bun run inventory          summary, the 20 largest, total stored
 *   bun run inventory --json   one row per snapshot
 *
 * Needs VERCEL_SANDBOX_TOKEN, VERCEL_SANDBOX_TEAM_ID and VERCEL_SANDBOX_PROJECT_ID.
 */
import { Sandbox, Snapshot } from "@vercel/sandbox";

export type SnapshotInput = {
	id: string;
	region: string;
	status: string;
	sizeBytes: number;
	lastUsedAt?: number;
};
export type SandboxInput = { name: string; currentSnapshotId?: string };

export type InventoryRow = {
	snapshotId: string;
	name: string | null;
	kind: "golden" | "workspace";
	region: string;
	sizeBytes: number;
	lastUsedAt: number | null;
};

export type SizeStats = {
	count: number;
	medianBytes: number;
	p90Bytes: number;
	maxBytes: number;
};

export type Inventory = {
	rows: InventoryRow[];
	goldens: SizeStats;
	workspaces: SizeStats;
	largest: InventoryRow[];
	totalBytes: number;
};

function nearestRank(sorted: number[], fraction: number): number {
	if (sorted.length === 0) return 0;
	return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)] ?? 0;
}

function sizeStats(rows: InventoryRow[]): SizeStats {
	const sizes = rows.map((row) => row.sizeBytes).sort((a, b) => a - b);
	return {
		count: sizes.length,
		medianBytes: nearestRank(sizes, 0.5),
		p90Bytes: nearestRank(sizes, 0.9),
		maxBytes: sizes.at(-1) ?? 0,
	};
}

export function summarizeInventory(
	snapshots: SnapshotInput[],
	sandboxes: SandboxInput[],
): Inventory {
	const nameBySnapshot = new Map(
		sandboxes
			.filter((sandbox) => sandbox.currentSnapshotId)
			.map((sandbox) => [sandbox.currentSnapshotId, sandbox.name]),
	);
	const rows = snapshots
		.filter((snapshot) => snapshot.status === "created")
		.map((snapshot): InventoryRow => {
			const name = nameBySnapshot.get(snapshot.id) ?? null;
			return {
				snapshotId: snapshot.id,
				name,
				kind: name?.startsWith("env-") ? "golden" : "workspace",
				region: snapshot.region,
				sizeBytes: snapshot.sizeBytes,
				lastUsedAt: snapshot.lastUsedAt ?? null,
			};
		})
		.sort((a, b) => b.sizeBytes - a.sizeBytes);
	return {
		rows,
		goldens: sizeStats(rows.filter((row) => row.kind === "golden")),
		workspaces: sizeStats(rows.filter((row) => row.kind === "workspace")),
		largest: rows.slice(0, 20),
		totalBytes: rows.reduce((sum, row) => sum + row.sizeBytes, 0),
	};
}

const gb = (bytes: number) => `${(bytes / 1e9).toFixed(2)} GB`;

export function formatInventory(inventory: Inventory): string {
	const stats = (label: string, s: SizeStats) =>
		`${label.padEnd(10)} ${String(s.count).padStart(6)}  median ${gb(s.medianBytes)}  p90 ${gb(s.p90Bytes)}  max ${gb(s.maxBytes)}`;
	const largest = inventory.largest.map(
		(row) =>
			`${gb(row.sizeBytes).padStart(10)}  ${(row.name ?? `(${row.snapshotId})`).padEnd(40)} ${row.region.padEnd(6)} ${row.lastUsedAt ? new Date(row.lastUsedAt).toISOString() : "never"}`,
	);
	return [
		stats("goldens", inventory.goldens),
		stats("workspaces", inventory.workspaces),
		"",
		`largest ${inventory.largest.length}:`,
		...largest,
		"",
		`total stored: ${gb(inventory.totalBytes)}`,
	].join("\n");
}

export function missingCredentials(
	env: Record<string, string | undefined>,
): string[] {
	return [
		"VERCEL_SANDBOX_TOKEN",
		"VERCEL_SANDBOX_TEAM_ID",
		"VERCEL_SANDBOX_PROJECT_ID",
	].filter((key) => !env[key] || env[key]?.startsWith("fake-"));
}

if (import.meta.main) {
	const missing = missingCredentials(process.env);
	if (missing.length > 0) {
		console.error(
			`inventory needs real Vercel sandbox credentials; missing or placeholder: ${missing.join(", ")}`,
		);
		process.exit(64);
	}
	const credentials = {
		token: process.env.VERCEL_SANDBOX_TOKEN ?? "",
		teamId: process.env.VERCEL_SANDBOX_TEAM_ID ?? "",
		projectId: process.env.VERCEL_SANDBOX_PROJECT_ID ?? "",
	};
	const [snapshots, sandboxes] = await Promise.all([
		Snapshot.list({ ...credentials, limit: 50 }).then((page) => page.toArray()),
		Sandbox.list({ ...credentials, limit: 50 }).then((page) => page.toArray()),
	]);
	const inventory = summarizeInventory(snapshots, sandboxes);
	console.log(
		process.argv.includes("--json")
			? JSON.stringify(inventory.rows, null, 2)
			: formatInventory(inventory),
	);
}
