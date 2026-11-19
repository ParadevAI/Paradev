/**
 * The same work on a box with a workspace drive and on one without, measured
 * the way a person meets it: create, install, stop, wake, and whether what
 * they wrote is still there. The REAL_SANDBOX_DRIVE pass of real-sandbox.ts
 * runs it; this module holds the work, the sentinels and the table.
 */

import { SANDBOX_PATHS } from "@superset/shared/sandbox/contract";

export const SENTINELS = [
	"uncommitted file",
	"local commit",
	"file in a bound home subtree",
	"file on the root disk",
	"docker image",
] as const;
export type SentinelName = (typeof SENTINELS)[number];

export interface StopMeasure {
	ms: number;
	snapshotBytes: number;
}

export interface BoxMeasures {
	createToReadyMs?: number;
	forkMs?: number;
	installMs?: number;
	writeMs?: number;
	firstStop?: StopMeasure;
	secondStop?: StopMeasure;
	wake?: {
		detachMs?: number;
		mountMs?: number;
		resumeMs?: number;
		bootMs?: number;
		totalMs: number;
	};
	/** From the start of the create or wake until git and node_modules answer in /workspace. */
	usableMs?: number;
	sentinels?: Partial<Record<SentinelName, boolean>>;
}

/** A command on the box: stdout only, since sudo there warns on stderr. */
export type BoxRun = (
	command: string,
	options?: { root?: boolean },
) => Promise<{ out: string; detail: string }>;

const WORKSPACE = SANDBOX_PATHS.workspace;
const DOCKER_UP =
	"pgrep -x dockerd > /dev/null || (dockerd > /tmp/dockerd.log 2>&1 &); for i in $(seq 1 60); do docker info > /dev/null 2>&1 && break; sleep 1; done";

async function timed(run: () => Promise<unknown>): Promise<number> {
	const started = Date.now();
	await run();
	return Date.now() - started;
}

export async function waitForCheckout(run: BoxRun): Promise<boolean> {
	const ready = await run(
		`for i in $(seq 1 600); do [ -f ${SANDBOX_PATHS.run}/checkout.ready ] && echo ready && exit 0; sleep 1; done; echo missing`,
	);
	return ready.out === "ready";
}

/** A real install, then `gb` GB of incompressible data under /workspace. */
export async function doWork(
	run: BoxRun,
	gb: number,
): Promise<{ installMs: number; writeMs: number; installed: string }> {
	let installed = "";
	const installMs = await timed(async () => {
		installed = (
			await run(
				`cd ${WORKSPACE} && bun install --frozen-lockfile > /tmp/bun-install.log 2>&1 && echo installed || tail -5 /tmp/bun-install.log`,
			)
		).out;
	});
	const writeMs = await timed(() =>
		run(
			`head -c ${gb * 1024 * 1024 * 1024} /dev/urandom > ${WORKSPACE}/.superset-work-filler && sync`,
		),
	);
	return { installMs, writeMs, installed };
}

export interface SentinelValues {
	token: string;
	commit: string;
	image: string;
}

export async function writeSentinels(
	run: BoxRun,
	token: string,
): Promise<SentinelValues> {
	const commit = await run(
		[
			`echo ${token} > ${WORKSPACE}/superset-sentinel-uncommitted.txt`,
			`git -C ${WORKSPACE} -c user.name=check -c user.email=check@example.invalid commit -q --allow-empty -m "sentinel ${token}"`,
			"mkdir -p ~/.cache ~/.config",
			`echo ${token} > ~/.cache/superset-sentinel`,
			`echo ${token} > ~/.config/superset-sentinel`,
			`git -C ${WORKSPACE} rev-parse HEAD`,
		].join(" && "),
	);
	const image = await run(
		`${DOCKER_UP}; mkdir -p /tmp/superset-sentinel && echo ${token} > /tmp/superset-sentinel/sentinel && tar -C /tmp/superset-sentinel -c . | docker import - superset-sentinel:check`,
		{ root: true },
	);
	return { token, commit: commit.out, image: image.out };
}

export async function readSentinels(
	run: BoxRun,
	values: SentinelValues,
): Promise<Record<SentinelName, boolean>> {
	const read = async (command: string, root = false) =>
		(await run(command, { root })).out;
	return {
		"uncommitted file":
			(await read(`cat ${WORKSPACE}/superset-sentinel-uncommitted.txt`)) ===
			values.token,
		"local commit":
			values.commit !== "" &&
			(await read(`git -C ${WORKSPACE} rev-parse HEAD`)) === values.commit,
		"file in a bound home subtree":
			(await read("cat ~/.cache/superset-sentinel")) === values.token,
		"file on the root disk":
			(await read("cat ~/.config/superset-sentinel")) === values.token,
		"docker image":
			values.image !== "" &&
			(await read(
				`${DOCKER_UP}; docker image inspect -f '{{.Id}}' superset-sentinel:check`,
				true,
			)) === values.image,
	};
}

/** Milliseconds from `since` until /workspace answers git and has node_modules. */
export async function usableSince(
	run: BoxRun,
	since: number,
): Promise<number | undefined> {
	const usable = await run(
		`for i in $(seq 1 300); do git -C ${WORKSPACE} status --porcelain > /dev/null 2>&1 && test -d ${WORKSPACE}/node_modules && echo usable && exit 0; sleep 1; done; echo never`,
	);
	return usable.out === "usable" ? Date.now() - since : undefined;
}

const seconds = (ms: number | undefined) =>
	ms === undefined ? "-" : `${(ms / 1000).toFixed(1)} s`;
const gigabytes = (bytes: number | undefined) =>
	bytes === undefined ? "-" : `${(bytes / 1024 ** 3).toFixed(2)} GB`;

/** One row per measure, one column per box. */
export function renderComparison(
	columns: Array<{ label: string; measures: BoxMeasures }>,
): string {
	const rows: Array<[string, (m: BoxMeasures) => string]> = [
		["create to host.ready", (m) => seconds(m.createToReadyMs)],
		["drive fork at create", (m) => seconds(m.forkMs)],
		["bun install", (m) => seconds(m.installMs)],
		["write the filler", (m) => seconds(m.writeMs)],
		["root snapshot, 1st stop", (m) => gigabytes(m.firstStop?.snapshotBytes)],
		["stop time, 1st stop", (m) => seconds(m.firstStop?.ms)],
		["wake: detach wait", (m) => seconds(m.wake?.detachMs)],
		["wake: mount update", (m) => seconds(m.wake?.mountMs)],
		["wake: resume", (m) => seconds(m.wake?.resumeMs)],
		["wake: boot to host.ready", (m) => seconds(m.wake?.bootMs)],
		["wake: total", (m) => seconds(m.wake?.totalMs)],
		["until /workspace is usable", (m) => seconds(m.usableMs)],
		["root snapshot, 2nd stop", (m) => gigabytes(m.secondStop?.snapshotBytes)],
		["stop time, 2nd stop", (m) => seconds(m.secondStop?.ms)],
		...SENTINELS.map((name): [string, (m: BoxMeasures) => string] => [
			`kept: ${name}`,
			(m) => {
				const kept = m.sentinels?.[name];
				return kept === undefined ? "-" : kept ? "yes" : "LOST";
			},
		]),
	];
	const table = [
		["", ...columns.map((column) => column.label)],
		...rows.map(([label, cell]) => [
			label,
			...columns.map((column) => cell(column.measures)),
		]),
	];
	const widths = table[0]?.map((_, i) =>
		Math.max(...table.map((row) => row[i]?.length ?? 0)),
	);
	return table
		.map((row) =>
			row
				.map((cell, i) =>
					i === 0
						? cell.padEnd(widths?.[i] ?? 0)
						: cell.padStart(widths?.[i] ?? 0),
				)
				.join("  "),
		)
		.join("\n");
}
