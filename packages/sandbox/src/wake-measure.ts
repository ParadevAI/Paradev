import { SANDBOX_PATHS } from "@superset/shared/sandbox/contract";
import type { BoxRun, StopMeasure } from "./drive-comparison";

/**
 * Wake cost of a realistic workspace, without a drive (A) and with one (B):
 * a full `bun install` and `bun run typecheck` of this repo, then a stop.
 * Three boxes per variant. `prepare` builds them, measures that stop, wakes
 * each once right away (warm) and stops it again. `cold`, dispatched at least
 * two hours later, wakes each once more, measures, and deletes every box and
 * drive. Each measure is one `WAKE-MEASURE {json}` line.
 */
export const WAKE_BOXES_PER_VARIANT = 3;
export const WAKE_BOX_PREFIX = "d-expiry-wake";

type Variant = "A" | "B";

export interface WakeMeasureDeps<Claim, Mounts = unknown> {
	log: (line: string) => void;
	runOn: (name: string) => BoxRun;
	stopMeasured: (name: string) => Promise<StopMeasure>;
	provision: (name: string, mounts: Mounts, claim: Claim) => Promise<void>;
	wake: (args: {
		providerSandboxId: string;
		claim: Claim;
		mounts: Mounts;
	}) => Promise<unknown>;
	claimFor: (driveName: string | null, laidOut: boolean) => Claim;
	createDrive: (name: string) => Promise<void>;
	driveNameFor: (box: string) => string;
	mountsFor: (driveName: string | null) => Mounts;
	deleteBox: (name: string, driveName: string | null) => Promise<void>;
}

interface WakeBox {
	name: string;
	variant: Variant;
	driveName: string | null;
}

export function wakeBoxes(
	suffix: string,
	driveNameFor: (box: string) => string,
): WakeBox[] {
	return (["A", "B"] as const).flatMap((variant) =>
		Array.from({ length: WAKE_BOXES_PER_VARIANT }, (_, i) => {
			const name = `${WAKE_BOX_PREFIX}-${variant.toLowerCase()}${i + 1}-${suffix}`;
			return {
				name,
				variant,
				driveName: variant === "B" ? driveNameFor(name) : null,
			};
		}),
	);
}

const WORKSPACE = SANDBOX_PATHS.workspace;

async function timed<T>(
	work: () => Promise<T>,
): Promise<{ ms: number; value: T }> {
	const started = Date.now();
	const value = await work();
	return { ms: Date.now() - started, value };
}

function emit(
	deps: { log: (line: string) => void },
	record: Record<string, unknown>,
) {
	deps.log(`WAKE-MEASURE ${JSON.stringify(record)}`);
}

async function stopAndRecord<Claim, Mounts>(
	deps: WakeMeasureDeps<Claim, Mounts>,
	box: WakeBox,
	stage: string,
) {
	const stop = await deps.stopMeasured(box.name);
	emit(deps, {
		stage,
		kind: "stop",
		box: box.name,
		variant: box.variant,
		stopMs: stop.ms,
		snapshotBytes: stop.snapshotBytes,
	});
}

/** Wake, then the first shell in /workspace, git status and the two typechecks. */
async function measureWake<Claim, Mounts>(
	deps: WakeMeasureDeps<Claim, Mounts>,
	box: WakeBox,
	kind: "warm" | "cold",
	sinceStopMs: number | null,
) {
	const run = deps.runOn(box.name);
	const started = Date.now();
	await deps.wake({
		providerSandboxId: box.name,
		claim: deps.claimFor(box.driveName, true),
		mounts: deps.mountsFor(box.driveName),
	});
	const hostReadyMs = Date.now() - started;
	await run(`cd ${WORKSPACE} && true`);
	const firstShellMs = Date.now() - started;
	const gitStatus = await timed(() =>
		run(`cd ${WORKSPACE} && git status --porcelain > /dev/null; echo $?`),
	);
	const typecheck = await timed(() =>
		run(
			`cd ${WORKSPACE} && bun run typecheck > /tmp/wake-typecheck.log 2>&1; echo $?`,
		),
	);
	const tsc = await timed(() =>
		run(
			`cd ${WORKSPACE}/packages/trpc && bunx tsc --noEmit -p . > /dev/null 2>&1; echo $?`,
		),
	);
	emit(deps, {
		stage: kind,
		kind: "wake",
		box: box.name,
		variant: box.variant,
		sinceStopMs,
		hostReadyMs,
		firstShellMs,
		gitStatusMs: gitStatus.ms,
		gitStatusExit: gitStatus.value.out,
		typecheckMs: typecheck.ms,
		typecheckExit: typecheck.value.out,
		trpcTscMs: tsc.ms,
		trpcTscExit: tsc.value.out,
	});
}

async function prepareBox<Claim, Mounts>(
	deps: WakeMeasureDeps<Claim, Mounts>,
	box: WakeBox,
) {
	const run = deps.runOn(box.name);
	if (box.driveName) await deps.createDrive(box.driveName);
	const mounts = deps.mountsFor(box.driveName);
	const firstClaim = deps.claimFor(box.driveName, false);
	await deps.provision(box.name, mounts, firstClaim);
	await deps.wake({ providerSandboxId: box.name, claim: firstClaim, mounts });
	const ready = await run(
		`for i in $(seq 1 600); do [ -f ${SANDBOX_PATHS.run}/checkout.ready ] && echo ready && exit 0; sleep 1; done; echo missing`,
	);
	if (ready.out !== "ready") throw new Error(`${box.name}: no checkout`);
	const install = await timed(() =>
		run(
			`cd ${WORKSPACE} && bun install --frozen-lockfile > /tmp/wake-install.log 2>&1; echo $?`,
		),
	);
	const typecheck = await timed(() =>
		run(
			`cd ${WORKSPACE} && bun run typecheck > /tmp/wake-typecheck.log 2>&1; echo $?`,
		),
	);
	const sizes = await run(
		`du -sh ${WORKSPACE} ${WORKSPACE}/node_modules ~/.bun ~/.cache 2>/dev/null | tr '\\t' ' ' | tr '\\n' ';'; df -h / | tail -1`,
	);
	emit(deps, {
		stage: "prepare",
		kind: "work",
		box: box.name,
		variant: box.variant,
		installMs: install.ms,
		installExit: install.value.out,
		typecheckMs: typecheck.ms,
		typecheckExit: typecheck.value.out,
		sizes: sizes.out,
	});
	await stopAndRecord(deps, box, "prepare");
	await measureWake(deps, box, "warm", 0);
	await stopAndRecord(deps, box, "warm");
}

async function settle(
	deps: { log: (line: string) => void },
	boxes: WakeBox[],
	each: (box: WakeBox) => Promise<void>,
): Promise<number> {
	const results = await Promise.allSettled(boxes.map(each));
	let failures = 0;
	results.forEach((result, i) => {
		if (result.status === "rejected") {
			failures++;
			deps.log(
				`FAIL wake-measure: ${boxes[i]?.name}: ${String(result.reason).slice(0, 300)}`,
			);
		}
	});
	return failures;
}

export async function prepareWakeMeasure<Claim, Mounts>(
	deps: WakeMeasureDeps<Claim, Mounts>,
	suffix: string,
): Promise<number> {
	const boxes = wakeBoxes(suffix, deps.driveNameFor);
	deps.log(
		`wake-measure: preparing ${boxes.map((b) => b.name).join(", ")}; dispatch "cold ${suffix}" after ${new Date(Date.now() + 2 * 3600_000).toISOString()} or later`,
	);
	const failures = await settle(deps, boxes, (box) => prepareBox(deps, box));
	deps.log(`wake-measure: prepared, suffix ${suffix}`);
	return failures;
}

export async function coldWakeMeasure<Claim, Mounts>(
	deps: WakeMeasureDeps<Claim, Mounts> & {
		stoppedAt: (name: string) => Promise<number | null>;
	},
	suffix: string,
): Promise<number> {
	const boxes = wakeBoxes(suffix, deps.driveNameFor);
	const failures = await settle(deps, boxes, async (box) => {
		const stopped = await deps.stoppedAt(box.name);
		await measureWake(
			deps,
			box,
			"cold",
			stopped === null ? null : Date.now() - stopped,
		);
		await stopAndRecord(deps, box, "cold");
	});
	return failures + (await deleteWakeMeasure(deps, suffix));
}

export async function deleteWakeMeasure<Claim, Mounts>(
	deps: WakeMeasureDeps<Claim, Mounts>,
	suffix: string,
): Promise<number> {
	const boxes = wakeBoxes(suffix, deps.driveNameFor);
	return settle(deps, boxes, async (box) => {
		await deps.deleteBox(box.name, box.driveName);
		deps.log(
			`wake-measure: ${box.name}${box.driveName ? ` and ${box.driveName}` : ""} deleted`,
		);
	});
}
