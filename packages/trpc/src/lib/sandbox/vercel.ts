/**
 * Called directly rather than behind a provider interface: there is one
 * provider, so an interface would be a second thing to keep in sync with no
 * second implementation to justify it.
 *
 * The provider's part is compute, filesystem, the published ports and the
 * egress firewall. Ours is the box itself: identity written to a file, boot
 * started through the sandbox API with the host secret in its env, the
 * managed environment pushed into host-service once it answers, and a
 * ticket-checking gate in front of every port (`access.ts`).
 */

import { randomUUID } from "node:crypto";
import * as Sentry from "@sentry/core";
import {
	renderSandboxConf,
	SANDBOX_PATHS,
	SANDBOX_PORTS,
	SANDBOX_PUBLISHED_PORTS,
	type SandboxIdentity,
	sandboxDrivePathOf,
} from "@superset/shared/sandbox/contract";
import {
	APIError,
	Drive,
	type NetworkPolicy,
	Sandbox,
	type SandboxMounts,
	type SandboxRegion,
} from "@vercel/sandbox";
import { bootStampsFrom, type HostAnswer } from "./boot-trace";
import {
	CODEX_AUTH_PATH,
	CODEX_SYSTEM_CONFIG_PATH,
	type SandboxFile,
} from "./credentials";
import {
	type DriveHost,
	deleteWorkspaceDrive,
	goldenDriveNameFor,
	vercelDrives,
	waitForDriveDetached,
	workspaceDriveMounts,
} from "./drives";
import { credentials } from "./vercel-credentials";

export const HOST_SERVICE_PORT = SANDBOX_PORTS.hostService;
/**
 * A session ends after this long; the workspace's files survive and the next
 * open resumes it. A workspace someone has open (`wakeSandbox`) or whose agent
 * is active (`topUpSandboxSession`) is extended before it gets there, so this
 * is really the idle stop.
 */
export const SESSION_TIMEOUT_MS = 60 * 60 * 1000;
/** Above the 10-minute client keepalive, so an open workspace is always extended in time. */
const EXTEND_BELOW_MS = 30 * 60 * 1000;
const MIN_TOP_UP_MS = 60 * 1000;
const WORKSPACE_SNAPSHOT_EXPIRATION_MS = 30 * 24 * 60 * 60 * 1000;
/** 2 GB of memory per vCPU; disk is 64 GB regardless. */
export const MEMORY_MB_PER_VCPU = 2048;
const GOLDEN_SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const BOOT_COMMAND = "/usr/local/bin/superset-boot";
const HOST_PROBE_TIMEOUT_MS = 1_500;

function isNotFound(error: unknown): boolean {
	return error instanceof APIError && error.response.status === 404;
}

/**
 * The sandbox cannot serve this workspace again: deleted out from under the
 * row, or its snapshots expired so a stopped session has nothing to resume
 * from (the platform answers 410). The row is what the caller should fail.
 */
export class SandboxUnavailableError extends Error {
	constructor(
		readonly providerSandboxId: string,
		cause: unknown,
	) {
		super(`Sandbox ${providerSandboxId} is unavailable`, { cause });
	}
}

function isUnavailable(error: unknown): boolean {
	return (
		error instanceof APIError &&
		(error.response.status === 404 || error.response.status === 410)
	);
}

/** Vercel starts a new session on every resume, so the id tells a stale record from a fresh one. */
function sessionIdOf(sandbox: Sandbox): string | null {
	try {
		return sandbox.currentSession().sessionId;
	} catch {
		return null;
	}
}

async function getSandbox(name: string): Promise<Sandbox | null> {
	try {
		return await Sandbox.get({ ...credentials(), name, resume: false });
	} catch (error) {
		if (isNotFound(error)) return null;
		throw error;
	}
}

export interface SandboxEnvironment {
	sourceKind: "image" | "fork";
	sourceRef: string;
	region: string;
	/** Set when the environment is in drive mode; see `drives.ts`. */
	goldenDriveName?: string | null;
}

/** Everything the box needs to become one workspace; nothing of it is a create-time env. */
export interface SandboxClaim {
	identity: SandboxIdentity;
	/** What the gate presents; travels only in the boot command's env. */
	hostSecret: string;
	managedEnv: Record<string, string>;
	networkPolicy: NetworkPolicy;
	/** The creator's agent login files; a golden under construction has none. */
	files?: SandboxFile[];
	/** Ports the workspace's repository asks to publish, beside the platform's. */
	ports?: readonly number[];
	vcpus: number;
	/** The bundle's agent-tools drive to mount read-only; absent keeps the image's agents. */
	agentToolsDrive?: string | null;
}

/** Vercel allows 5 tags per sandbox. */
function sandboxTags(
	kind: "workspace" | "environment",
	identity: SandboxIdentity,
): Record<string, string> {
	const tags = { kind, org: identity.SUPERSET_SANDBOX_ORGANIZATION_ID };
	// A golden's identity is the workspace it was built from, not its own.
	if (kind === "environment") return tags;
	const user = identity.SUPERSET_SANDBOX_CREATOR_USER_ID;
	return {
		...tags,
		workspace: identity.SUPERSET_SANDBOX_WORKSPACE_ID,
		...(user ? { user } : {}),
	};
}

const publishedAgentToolsDrives = new Set<string>();

/**
 * A mount of a drive that does not exist fails the create, and a drive a
 * writer still holds read-write mounts corrupt. Only a drive that exists and
 * is detached is mounted; that answer is final for a drive, so it is cached.
 */
export async function agentToolsMounts(
	driveName: string | null | undefined,
	getDrive: (name: string) => Promise<Pick<Drive, "currentSandboxName">> = (
		name,
	) => Drive.get({ ...credentials(), name }),
): Promise<SandboxMounts | undefined> {
	if (!driveName) return undefined;
	if (!publishedAgentToolsDrives.has(driveName)) {
		try {
			const drive = await getDrive(driveName);
			if (drive.currentSandboxName) {
				console.warn(
					`[sandbox] agent-tools drive ${driveName} is attached to ${drive.currentSandboxName}; not mounting`,
				);
				return undefined;
			}
		} catch (error) {
			console.warn(
				`[sandbox] agent-tools drive ${driveName} unavailable; not mounting`,
				error,
			);
			return undefined;
		}
		publishedAgentToolsDrives.add(driveName);
	}
	return { [SANDBOX_PATHS.agents]: { drive: driveName, mode: "snapshot" } };
}

/** One `mounts` object for a session; a later part wins a path both name. */
export function composeMounts(
	...parts: Array<SandboxMounts | undefined>
): SandboxMounts | undefined {
	const mounts = Object.assign({}, ...parts.filter(Boolean)) as SandboxMounts;
	return Object.keys(mounts).length > 0 ? mounts : undefined;
}

function readWriteDriveAt(mounts: SandboxMounts, path: string): string | null {
	const mount = mounts[path];
	if (!mount) return null;
	if (mount instanceof Drive) return mount.name;
	return mount.mode === "read-write" ? mount.drive : null;
}

function publishedPorts(extra: readonly number[] = []): number[] {
	return [...new Set([...SANDBOX_PUBLISHED_PORTS, ...extra])];
}

/**
 * The identity file, written before boot on every create and wake: what a
 * person can read on the box to see which workspace it is. A file rather
 * than a variable on the boot command, so it can hold whatever the box needs
 * without a size limit and so the runner's inputs never change shape.
 */
async function writeIdentity(
	sandbox: Sandbox,
	identity: SandboxIdentity,
): Promise<void> {
	await sandbox.writeFiles([
		{
			path: SANDBOX_PATHS.conf,
			content: renderSandboxConf(identity),
			mode: 0o644,
		},
	]);
}

/**
 * The agents' login files, on every wake including one that finds the box
 * serving: a sign-in made since the last boot has to reach the next agent
 * started there. They hold placeholders only.
 */
async function writeSignInFiles(
	sandbox: Sandbox,
	files: SandboxFile[] = [],
): Promise<void> {
	if (files.length === 0) return;
	await sandbox.writeFiles(files.map((file) => ({ ...file, mode: 0o644 })));
}

/**
 * Starts boot: root, detached, with the host secret in the command's env and
 * nowhere else. The platform's own `sudo: true` resets the env; the image's
 * sudoers grants SETENV, so the secret crosses into root without touching
 * argv. The runner refuses to stack a second host-service on a live one, so
 * a wake that races a wake is harmless.
 */
async function runBoot(sandbox: Sandbox, hostSecret: string): Promise<string> {
	// Stamped on boot.start, so a wait reads only this boot's lines of the log.
	const bootId = randomUUID();
	await sandbox.runCommand({
		cmd: "sudo",
		args: ["--preserve-env=HOST_SERVICE_SECRET,SUPERSET_BOOT_ID", BOOT_COMMAND],
		detached: true,
		env: { HOST_SERVICE_SECRET: hostSecret, SUPERSET_BOOT_ID: bootId },
	});
	return bootId;
}

/**
 * Creates the sandbox, writes its identity and starts boot. Returns once the
 * sandbox's address exists, not once anything listens on it; `settleSandbox`
 * is how a caller waits for that. Idempotent on the name: a re-delivered
 * provision finds the sandbox it already made.
 */
export async function provisionSandbox(args: {
	name: string;
	environment: SandboxEnvironment;
	claim: SandboxClaim;
	/** A golden under construction keeps its snapshots until its row goes. */
	kind?: "workspace" | "environment";
	mounts?: SandboxMounts;
	exclusive?: ResumeLock;
}): Promise<{
	providerSandboxId: string;
	sandboxUrl: string;
	hostTarget: string;
	expiresAt: Date | null;
	sessionId: string | null;
	/** Ties a wait for host-service to this boot's lines of the boot log. */
	bootId: string;
}> {
	const kind = args.kind ?? "workspace";
	const config = {
		...credentials(),
		name: args.name,
		ports: publishedPorts(args.claim.ports),
		timeout: SESSION_TIMEOUT_MS,
		env: {},
		networkPolicy: args.claim.networkPolicy,
		persistent: true,
		snapshotExpiration:
			kind === "environment" ? 0 : WORKSPACE_SNAPSHOT_EXPIRATION_MS,
		keepLastSnapshots: { count: 1 },
		tags: sandboxTags(kind, args.claim.identity),
	};
	const mounts = composeMounts(
		args.mounts,
		await agentToolsMounts(args.claim.agentToolsDrive),
	);
	return (args.exclusive ?? unlocked)(async () => {
		const existing = await getSandbox(args.name);
		// A redelivered provision whose box has stopped: its drive may still be flushing, and anything below resumes the box.
		if (existing && existing.status !== "running") {
			const drive = mounts
				? readWriteDriveAt(mounts, SANDBOX_PATHS.drive)
				: null;
			const outcome = drive
				? await waitForDriveDetached(drive, {
						heldByCaller: heldByThisRunningBox(args.name),
					})
				: "detached";
			if (outcome === "detached" && mounts) await existing.update({ mounts });
		}
		const sandbox =
			existing ??
			(await Sentry.startSpan(
				{
					name:
						args.environment.sourceKind === "fork"
							? "fork"
							: "create from image",
					op: "sandbox.provider",
					attributes: {
						"sandbox.name": args.name,
						"sandbox.source": args.environment.sourceRef,
						"sandbox.region": args.environment.region,
						"sandbox.vcpus": args.claim.vcpus,
					},
				},
				() =>
					args.environment.sourceKind === "fork"
						? // A fork copies the golden's region; a snapshot only exists where
							// it was taken.
							Sandbox.fork({
								...config,
								...(mounts ? { mounts } : {}),
								sourceSandbox: args.environment.sourceRef,
								resources: { vcpus: args.claim.vcpus },
							})
						: Sandbox.create({
								...config,
								...(mounts ? { mounts } : {}),
								image: args.environment.sourceRef,
								region: args.environment.region as SandboxRegion,
								resources: { vcpus: args.claim.vcpus },
							}),
			));
		let bootId = "";
		await Sentry.startSpan({ name: "start boot", op: "sandbox" }, async () => {
			await writeIdentity(sandbox, args.claim.identity);
			await writeSignInFiles(sandbox, args.claim.files);
			bootId = await runBoot(sandbox, args.claim.hostSecret);
		});
		return {
			providerSandboxId: args.name,
			sandboxUrl: sandbox.domain(HOST_SERVICE_PORT),
			hostTarget: sandbox.domain(HOST_SERVICE_PORT),
			expiresAt: sandbox.expiresAt ?? null,
			sessionId: sessionIdOf(sandbox),
			bootId,
		};
	});
}

const HOST_READY_TIMEOUT_MS = 60_000;
const HOST_READY_POLL_MS = 100;

export class SandboxNotReadyError extends Error {
	constructor(providerSandboxId: string) {
		super(`host-service in ${providerSandboxId} did not answer in time`);
		this.name = "SandboxNotReadyError";
	}
}

/**
 * The box did not come up on the drive its identity names: the drive did not
 * mount, belongs to another workspace, or the boot never laid it out. The
 * data is intact, so it is a not-ready the next wake retries, never a failure.
 */
export class SandboxDriveMissingError extends SandboxNotReadyError {
	constructor(
		providerSandboxId: string,
		readonly driveName: string,
		readonly reason: string,
	) {
		super(providerSandboxId);
		this.name = "SandboxDriveMissingError";
		this.message = `Sandbox ${providerSandboxId} did not come up on its drive ${driveName}: ${reason}`;
	}
}

/**
 * The drive refused for good: the same refusal that no remount can change, in
 * several boots in a row. The workspace is marked failed with this message;
 * its drive and box are kept.
 */
export class SandboxDriveRefusedError extends SandboxUnavailableError {
	constructor(
		providerSandboxId: string,
		readonly driveName: string,
		readonly reason: string,
		readonly boots: number,
	) {
		super(providerSandboxId, new Error(reason));
		this.name = "SandboxDriveRefusedError";
		this.message = `Sandbox ${providerSandboxId} refused its drive ${driveName} in ${boots} boots in a row: ${reason}`;
	}
}

/** Boots in a row that a refusal no remount can change ends the retries. */
export const DRIVE_REFUSAL_LIMIT = 3;

const STAMP = /^(\d+) ([a-z][a-z0-9-]*(?:\.[a-z0-9-]+)+)(?: (.*))?$/;

interface DriveBoot {
	id: string | null;
	refusal: string | null;
	laidOut: boolean;
	hostStarted: boolean;
}

/**
 * The boot log is append-only across sessions. One entry per boot; a
 * reexec's second `boot.start` carries the same boot id and joins its boot.
 */
export function driveBootsIn(bootLog: string): DriveBoot[] {
	const boots: DriveBoot[] = [];
	for (const line of bootLog.split("\n")) {
		const match = STAMP.exec(line.trim());
		if (!match) continue;
		const [, , phase, detail = ""] = match;
		if (phase === "boot.start") {
			const id = /(?:^| )boot=(\S+)/.exec(detail)?.[1] ?? null;
			const last = boots.at(-1);
			if (!(last && id && last.id === id)) {
				boots.push({ id, refusal: null, laidOut: false, hostStarted: false });
			}
			continue;
		}
		const boot = boots.at(-1);
		if (!boot) continue;
		if (/^drive\.(missing|foreign|unlaid|downgrade)$/.test(phase ?? "")) {
			boot.refusal ??= `${phase} ${detail}`.trim();
		} else if (phase === "drive.layout") {
			boot.laidOut = true;
		} else if (phase === "host.exec") {
			boot.hostStarted = true;
		}
	}
	return boots;
}

/** This boot's refusal, if it refused; another boot's line never counts. */
export function driveRefusalIn(bootLog: string, bootId: string): string | null {
	const boot = driveBootsIn(bootLog)
		.reverse()
		.find((entry) => entry.id === bootId);
	return boot?.refusal ?? null;
}

/**
 * How many of the last boots in a row failed in a way a remount cannot fix:
 * a drive of another workspace, a drive with no owner, a boot script that
 * predates the drive, or a boot that started host-service without a layout.
 */
export function persistentDriveRefusals(bootLog: string): number {
	let count = 0;
	for (const boot of driveBootsIn(bootLog).reverse()) {
		const persistent = boot.refusal
			? !boot.refusal.startsWith("drive.missing")
			: boot.hostStarted && !boot.laidOut;
		if (!persistent) break;
		count++;
	}
	return count;
}

/** How often a wait for host-service also reads the boot log for a drive refusal. */
const DRIVE_REFUSAL_POLL_MS = 2_000;

async function waitForHostService(
	target: string,
	providerSandboxId: string,
	refusal?: () => Promise<Error | null>,
): Promise<HostAnswer> {
	const deadline = Date.now() + HOST_READY_TIMEOUT_MS;
	let nextRefusalCheck = 0;
	while (Date.now() < deadline) {
		if (refusal && Date.now() >= nextRefusalCheck) {
			const refused = await refusal();
			if (refused) throw refused;
			nextRefusalCheck = Date.now() + DRIVE_REFUSAL_POLL_MS;
		}
		const body: unknown = await fetch(`${target}/trpc/health.check`, {
			signal: AbortSignal.timeout(HOST_READY_POLL_MS * 6),
		})
			.then((response) =>
				response.ok ? response.json().catch(() => ({})) : null,
			)
			.catch(() => null);
		if (body !== null) {
			return { stamps: bootStampsFrom(body), answeredAt: Date.now() };
		}
		await new Promise((resolve) => setTimeout(resolve, HOST_READY_POLL_MS));
	}
	throw new SandboxNotReadyError(providerSandboxId);
}

/**
 * The half of a wake after boot is fired: wait for host-service to answer,
 * then push the managed environment. What a create runs once its box is
 * booted, so it never re-runs the wake's own calls on a box it just made.
 */
export async function settleSandbox(args: {
	providerSandboxId: string;
	hostTarget: string;
	claim: SandboxClaim;
	/** The boot this settle waits for; without one, no refusal is read from the log. */
	bootId?: string;
	/** Fetches the box fresh for each read of the boot log. */
	getBox?: () => Promise<Pick<Sandbox, "readFileToBuffer" | "status">>;
}): Promise<HostAnswer> {
	const driveName = args.claim.identity.SUPERSET_SANDBOX_DRIVE;
	const getBox =
		args.getBox ??
		(() =>
			Sandbox.get({
				...credentials(),
				name: args.providerSandboxId,
				resume: false,
			}));
	const bootLog = async () => {
		// A read from a box another caller stopped could resume it with the drive still held.
		const box = await getBox();
		if (box.status !== "running") return "";
		const log = await box
			.readFileToBuffer({ path: SANDBOX_PATHS.bootLog })
			.catch(() => null);
		return log?.toString("utf8") ?? "";
	};
	const driveFailure = (driveName: string, reason: string, log: string) => {
		const boots = persistentDriveRefusals(log);
		if (boots < DRIVE_REFUSAL_LIMIT) {
			console.warn(`[sandbox] ${args.providerSandboxId}: ${reason}`);
			return new SandboxDriveMissingError(
				args.providerSandboxId,
				driveName,
				reason,
			);
		}
		const refused = new SandboxDriveRefusedError(
			args.providerSandboxId,
			driveName,
			reason,
			boots,
		);
		Sentry.captureException(refused);
		return refused;
	};
	const bootId = args.bootId;
	const refusal =
		driveName && bootId
			? async () => {
					const log = await bootLog();
					const refused = driveRefusalIn(log, bootId);
					return refused ? driveFailure(driveName, refused, log) : null;
				}
			: undefined;
	const answer = await waitForHostService(
		args.hostTarget,
		args.providerSandboxId,
		refusal,
	);
	// A pinned bundle whose boot predates the drive layout serves the root disk's empty /workspace.
	if (
		driveName &&
		!answer.stamps.some((stamp) => stamp.phase === "drive.layout")
	) {
		throw driveFailure(
			driveName,
			"the boot answered without laying the drive out",
			await bootLog(),
		);
	}
	await pushManagedEnv(
		args.hostTarget,
		args.claim.hostSecret,
		args.claim.managedEnv,
	);
	return answer;
}

/**
 * Replaces host-service's managed environment. Direct to the box with the
 * host secret, the way the gate would; superjson is host-service's wire
 * format, so the input is wrapped the way its client would wrap it.
 */
export async function pushManagedEnv(
	target: string,
	hostSecret: string,
	variables: Record<string, string>,
): Promise<void> {
	const response = await fetch(`${target}/trpc/sandbox.setEnvironment`, {
		method: "POST",
		headers: {
			authorization: `Bearer ${hostSecret}`,
			"content-type": "application/json",
		},
		body: JSON.stringify({ json: { variables } }),
		signal: AbortSignal.timeout(10_000),
	});
	if (!response.ok) {
		throw new Error(`sandbox.setEnvironment answered ${response.status}`);
	}
}

/**
 * Re-applies the credential rules to a running box: the GitHub token in them
 * lasts an hour (a user token eight), so a box nobody reopens asks for this
 * before it expires. Wakes nothing; a stopped box gets fresh rules on wake.
 */
export async function applySandboxPolicy(args: {
	providerSandboxId: string;
	networkPolicy: NetworkPolicy;
}): Promise<"applied" | "not-running"> {
	const sandbox = await Sandbox.get({
		...credentials(),
		name: args.providerSandboxId,
		resume: false,
	}).catch((error: unknown) => {
		if (isNotFound(error)) return null;
		throw error;
	});
	if (!sandbox || sandbox.status !== "running") return "not-running";
	await sandbox.update({ networkPolicy: args.networkPolicy });
	return "applied";
}

/** The sandbox's addresses and whether a session is running, waking nothing. */
export async function describeSandbox(providerSandboxId: string): Promise<{
	hostTarget: string;
	running: boolean;
	vcpus: number | undefined;
	/** When the running session ends unless extended; null when stopped. */
	expiresAt: Date | null;
	sessionId: string | null;
}> {
	try {
		const sandbox = await Sandbox.get({
			...credentials(),
			name: providerSandboxId,
			resume: false,
		});
		const running = sandbox.status === "running";
		return {
			hostTarget: sandbox.domain(HOST_SERVICE_PORT),
			running,
			// `sandbox.vcpus` is the configured size, which a running session does not pick up.
			vcpus: running ? sandbox.currentSession().vcpus : sandbox.vcpus,
			expiresAt: running ? (sandbox.expiresAt ?? null) : null,
			sessionId: sessionIdOf(sandbox),
		};
	} catch (error) {
		if (isUnavailable(error))
			throw new SandboxUnavailableError(providerSandboxId, error);
		throw error;
	}
}

/**
 * Extends a running session so it ends `SESSION_TIMEOUT_MS` from now; never
 * wakes a stopped one. The provider only extends by a duration, and refuses
 * past the plan's 24h session cap. Goes through the session:
 * `Sandbox.extendTimeout` resumes a session that stopped meanwhile.
 */
export async function topUpSandboxSession(
	providerSandboxId: string,
): Promise<{ expiresAt: Date; sessionId: string | null } | null> {
	const sandbox = await getSandbox(providerSandboxId);
	if (sandbox?.status !== "running" || !sandbox.expiresAt) return null;
	const extension =
		Date.now() + SESSION_TIMEOUT_MS - sandbox.expiresAt.getTime();
	if (extension > MIN_TOP_UP_MS) {
		await sandbox.currentSession().extendTimeout(extension);
	}
	return sandbox.expiresAt
		? { expiresAt: sandbox.expiresAt, sessionId: sessionIdOf(sandbox) }
		: null;
}

/** Whether host-service is already serving, so a wake can skip the boot. */
async function hostServiceAnswers(hostTarget: string): Promise<boolean> {
	try {
		const response = await fetch(`${hostTarget}/trpc/health.check`, {
			signal: AbortSignal.timeout(HOST_PROBE_TIMEOUT_MS),
		});
		return response.ok;
	} catch {
		return false;
	}
}

/**
 * Brings a workspace's box to serving and returns once host-service answers.
 *
 * A stopped session is resumed by the boot command itself (runCommand resumes
 * before it runs); a running one is extended so an open workspace never hits
 * the idle stop. Either way the identity is rewritten (a bundle pin may have
 * moved), the credential rules are re-applied (a token may have aged), and
 * the managed environment is pushed again (a fresh session holds none).
 */
/**
 * Runs `step` alone among everything that may resume this sandbox, and throws
 * SandboxNotReadyError when another caller holds it. A stopped box's drive
 * check and the call that resumes it are one step under it, so no two
 * sessions ever hold the drive.
 */
export type ResumeLock = <T>(step: () => Promise<T>) => Promise<T>;
const unlocked: ResumeLock = (step) => step();

/** A drive attached to this very sandbox, running again, is held by the session another caller resumed. */
function heldByThisRunningBox(providerSandboxId: string) {
	return async (attachedTo: string) =>
		attachedTo === providerSandboxId &&
		(
			await Sandbox.get({
				...credentials(),
				name: providerSandboxId,
				resume: false,
			})
		).status === "running";
}

export type WakePhase = "detach" | "mount" | "resume" | "boot";

export async function wakeSandbox(args: {
	providerSandboxId: string;
	claim: SandboxClaim;
	/** Replaces the box's mounts before a stopped session resumes; a running one keeps its own. */
	mounts?: SandboxMounts;
	/** Runs once the box is known to be stopped, before anything resumes it. */
	beforeResume?: (box: { memoryMb: number; vcpus: number }) => Promise<void>;
	/** How long each part of the wake took, for a check that measures it. */
	onPhase?: (phase: WakePhase, ms: number) => void;
	exclusive?: ResumeLock;
}): Promise<{
	hostTarget: string;
	/** The session was stopped, so every process on the box started from this claim. */
	booted: boolean;
	/** The boot command ran: the session was stopped, or host-service in it had stopped answering. */
	rebooted: boolean;
	answer: HostAnswer;
	expiresAt: Date | null;
	sessionId: string | null;
}> {
	const timed = async <T>(phase: WakePhase, run: () => Promise<T>) => {
		const started = Date.now();
		try {
			return await run();
		} finally {
			args.onPhase?.(phase, Date.now() - started);
		}
	};
	const exclusive = args.exclusive ?? unlocked;
	try {
		const resumed = await exclusive(async () => {
			const sandbox = await Sandbox.get({
				...credentials(),
				name: args.providerSandboxId,
				resume: false,
			});
			const hostTarget = sandbox.domain(HOST_SERVICE_PORT);
			const wasRunning = sandbox.status === "running";
			let vcpus = sandbox.vcpus ?? args.claim.vcpus;
			if (!wasRunning && vcpus !== args.claim.vcpus) {
				await Sentry.startSpan({ name: "resize", op: "sandbox.provider" }, () =>
					sandbox
						.update({ resources: { vcpus: args.claim.vcpus } })
						.then(() => {
							vcpus = args.claim.vcpus;
						})
						.catch((error) =>
							console.warn(
								`[sandbox] resize to ${args.claim.vcpus} vCPUs failed for ${args.providerSandboxId}`,
								error,
							),
						),
				);
			}
			let resumedByAnotherWake = false;
			if (!wasRunning) {
				const { [SANDBOX_PATHS.agents]: previousAgents, ...kept } =
					sandbox.mounts ?? {};
				const agents = await agentToolsMounts(args.claim.agentToolsDrive);
				const mounts = composeMounts(kept, args.mounts, agents) ?? {};
				const drive = readWriteDriveAt(mounts, SANDBOX_PATHS.drive);
				if (drive) {
					const outcome = await Sentry.startSpan(
						{ name: "drive detach", op: "sandbox.provider" },
						() =>
							timed("detach", () =>
								waitForDriveDetached(drive, {
									heldByCaller: heldByThisRunningBox(args.providerSandboxId),
								}),
							),
					);
					// A concurrent wake resumed this box with its drive meanwhile.
					resumedByAnotherWake = outcome === "held";
				}
				if (
					!resumedByAnotherWake &&
					(agents || previousAgents || args.mounts)
				) {
					const update = Sentry.startSpan(
						{ name: "mount", op: "sandbox.provider" },
						() => timed("mount", () => sandbox.update({ mounts })),
					);
					// Without its drive the workspace would boot on an empty /workspace.
					if (args.mounts) await update;
					else
						await update.catch((error) =>
							console.warn(
								`[sandbox] mount update failed for ${args.providerSandboxId}`,
								error,
							),
						);
				}
			}
			const running = wasRunning || resumedByAnotherWake;
			if (!running && args.beforeResume) {
				await args.beforeResume({
					memoryMb: vcpus * MEMORY_MB_PER_VCPU,
					vcpus,
				});
			}
			if (wasRunning) {
				const remaining = (sandbox.expiresAt?.getTime() ?? 0) - Date.now();
				if (remaining < EXTEND_BELOW_MS) {
					// Past the plan's per-session cap the extension is refused; the
					// session then ends and the next open resumes it.
					await sandbox.extendTimeout(SESSION_TIMEOUT_MS).catch(() => {});
				}
			}
			// A box that is already serving needs neither a fresh identity file nor
			// another boot. The policy still goes out: a credential may have aged.
			const serving = running && (await hostServiceAnswers(hostTarget));
			const resumeStarted = Date.now();
			await Sentry.startSpan(
				{ name: "apply claim", op: "sandbox.provider" },
				() =>
					Promise.all([
						sandbox
							.update({ networkPolicy: args.claim.networkPolicy })
							.catch((error) =>
								console.warn(
									`[sandbox] policy update failed for ${args.providerSandboxId}`,
									error,
								),
							),
						serving ? null : writeIdentity(sandbox, args.claim.identity),
						writeSignInFiles(sandbox, args.claim.files),
					]),
			);
			const bootId = serving
				? undefined
				: await Sentry.startSpan({ name: "start boot", op: "sandbox" }, () =>
						runBoot(sandbox, args.claim.hostSecret),
					);
			args.onPhase?.("resume", Date.now() - resumeStarted);
			return { sandbox, hostTarget, running, serving, bootId };
		});
		const { sandbox, hostTarget, running, serving, bootId } = resumed;
		const answer = await Sentry.startSpan(
			{ name: "settle", op: "sandbox" },
			() =>
				timed("boot", () =>
					settleSandbox({
						providerSandboxId: args.providerSandboxId,
						hostTarget,
						claim: args.claim,
						bootId,
					}),
				),
		).catch(async (error) => {
			// Stopped: the next wake mounts the drive afresh, and a refused box bills nothing.
			if (
				error instanceof SandboxDriveMissingError ||
				error instanceof SandboxDriveRefusedError
			) {
				// Under the lock, so no caller resumes the box between its check and this stop.
				await exclusive(() => sandbox.stop()).catch(() => {});
			}
			throw error;
		});
		return {
			hostTarget,
			booted: !running,
			rebooted: !serving,
			answer,
			expiresAt: sandbox.expiresAt ?? null,
			sessionId: sessionIdOf(sandbox),
		};
	} catch (error) {
		if (isUnavailable(error))
			throw new SandboxUnavailableError(args.providerSandboxId, error);
		throw error;
	}
}

/**
 * Identity a workspace writes for itself on boot. A golden must carry none of
 * it, or every fork would come up as the promoted workspace.
 */
const INHERITED_IDENTITY = [
	SANDBOX_PATHS.conf,
	// A fork's logs start with its own boot, not the golden's.
	SANDBOX_PATHS.logs,
	SANDBOX_PATHS.hostDb,
	`${SANDBOX_PATHS.hostDb}-wal`,
	`${SANDBOX_PATHS.hostDb}-shm`,
	SANDBOX_PATHS.checkouts,
	`${SANDBOX_PATHS.state}/agent-launched`,
	`${SANDBOX_PATHS.state}/db-branch`,
	`${SANDBOX_PATHS.home}/.paradev/host`,
	// Boxes from before the home directory moved.
	`${SANDBOX_PATHS.home}/.superset/host`,
	`${SANDBOX_PATHS.home}/.gitconfig`,
	`${SANDBOX_PATHS.workspace}/.env`,
	CODEX_AUTH_PATH,
	CODEX_SYSTEM_CONFIG_PATH,
];

/** Agent sessions are the person's; on a drive they would reach every fork. */
const DRIVE_IDENTITY = [
	`${SANDBOX_PATHS.home}/.claude/projects`,
	`${SANDBOX_PATHS.home}/.codex/sessions`,
];

/**
 * The paths to remove so a fork starts clean. With a drive, also where those
 * paths sit on the drive itself, for a box no boot has laid out.
 */
export function inheritedIdentityPaths(withDrive: boolean): string[] {
	if (!withDrive) return INHERITED_IDENTITY;
	const paths = [...INHERITED_IDENTITY, ...DRIVE_IDENTITY];
	const onDrive = paths.flatMap((path) => sandboxDrivePathOf(path) ?? []);
	return [...paths, ...onDrive, SANDBOX_PATHS.driveState];
}

/** Removes what a box wrote for the workspace it was, so a fork starts clean. */
export async function stripWorkspaceIdentity(
	sandbox: Pick<Sandbox, "runCommand">,
	options: { withDrive?: boolean } = {},
): Promise<void> {
	const withDrive = options.withDrive ?? false;
	// Unmounted, the rm would miss the drive, and every fork would refuse it as another workspace's.
	const result = await sandbox.runCommand({
		cmd: "bash",
		args: [
			"-c",
			`${withDrive ? `mountpoint -q ${SANDBOX_PATHS.drive} || exit 3; ` : ""}rm -rf -- "$@"`,
			"strip",
			...inheritedIdentityPaths(withDrive),
		],
		sudo: true,
	});
	if (result.exitCode !== 0) {
		throw new Error(
			result.exitCode === 3
				? `${SANDBOX_PATHS.drive} is not mounted; the golden's drive keeps the source's identity`
				: `stripping the workspace identity exited ${result.exitCode}`,
		);
	}
}

/**
 * Stops a sandbox and returns once the snapshot forks would start from is
 * current. What a release does to a golden it has finished building.
 */
/** Returns the session it stopped. */
export async function stopAndSnapshot(
	name: string,
): Promise<{ sessionId: string | null }> {
	const sandbox = await Sandbox.get({ ...credentials(), name, resume: false });
	const before = sandbox.currentSnapshotId;
	const sessionId = sessionIdOf(sandbox);
	await sandbox.stop();
	await waitForStopSnapshot(name, before);
	return { sessionId };
}

/**
 * A golden is a stopped sandbox whose current snapshot is what forks start
 * from. It is built from a snapshot of the source taken now (a fork alone
 * would start from the source's last stop) and created with an empty env.
 * Taking that snapshot ends the source's session, so a running source is
 * started again before this returns.
 *
 * A source with a drive gives the golden a fork of it, taken once the source
 * has released it; the golden drive is stripped and released the same way.
 */
export async function promoteSandboxToEnvironment(args: {
	sourceSandbox: string;
	goldenName: string;
	/** What restarts the source: it boots the same way a wake does. */
	claim: SandboxClaim;
	sourceDriveName?: string | null;
	drives?: DriveHost;
}): Promise<{
	goldenName: string;
	region: string;
	goldenDriveName: string | null;
}> {
	const drives = args.drives ?? vercelDrives();
	const source = await Sandbox.get({
		...credentials(),
		name: args.sourceSandbox,
		resume: false,
	});
	const wasRunning = source.status === "running";
	const snapshot = await source.snapshot();
	let goldenDriveName: string | null = null;
	if (args.sourceDriveName) {
		goldenDriveName = goldenDriveNameFor(args.goldenName);
		await waitForDriveDetached(args.sourceDriveName, { drives });
		await drives.fork(args.sourceDriveName, goldenDriveName);
	}
	const golden = await Sandbox.create({
		...credentials(),
		name: args.goldenName,
		source: { type: "snapshot", snapshotId: snapshot.snapshotId },
		ports: publishedPorts(),
		timeout: GOLDEN_SESSION_TIMEOUT_MS,
		region: source.region as SandboxRegion,
		...(source.vcpus ? { resources: { vcpus: source.vcpus } } : {}),
		env: {},
		persistent: true,
		snapshotExpiration: 0,
		keepLastSnapshots: { count: 1 },
		tags: sandboxTags("environment", args.claim.identity),
		...(goldenDriveName
			? { mounts: workspaceDriveMounts(goldenDriveName) }
			: {}),
	});
	await stripWorkspaceIdentity(golden, { withDrive: goldenDriveName !== null });
	const created = golden.currentSnapshotId;
	await golden.stop();
	await waitForStopSnapshot(args.goldenName, created);
	if (goldenDriveName) await waitForDriveDetached(goldenDriveName, { drives });
	if (wasRunning) {
		if (args.sourceDriveName) {
			await source.update({
				mounts: composeMounts(
					source.mounts,
					workspaceDriveMounts(args.sourceDriveName),
				),
			});
		}
		await writeIdentity(source, args.claim.identity);
		await writeSignInFiles(source, args.claim.files);
		await runBoot(source, args.claim.hostSecret);
	}
	return {
		goldenName: args.goldenName,
		region: source.region,
		goldenDriveName,
	};
}

/**
 * stop() returns while the sandbox is still `stopping`; a fork taken before
 * the stop's snapshot is current boots from whatever was current before.
 */
export async function waitForStopSnapshot(
	name: string,
	previous: string | undefined,
): Promise<void> {
	const deadline = Date.now() + 3 * 60 * 1000;
	while (Date.now() < deadline) {
		const sandbox = await Sandbox.get({
			...credentials(),
			name,
			resume: false,
		});
		const current = sandbox.currentSnapshotId;
		if (sandbox.status === "stopped" && current && current !== previous) return;
		await new Promise((resolve) => setTimeout(resolve, 2000));
	}
	throw new Error(`${name} did not snapshot in time`);
}

/**
 * Ends the session without waiting for its snapshot: what a failed create
 * does to the box it keeps, so it costs storage rather than compute until
 * someone resumes it to look or deletes it.
 */
export async function sandboxExists(
	providerSandboxId: string,
): Promise<boolean> {
	return (await getSandbox(providerSandboxId)) !== null;
}

/** Returns the session that is now stopped: the one it stopped, or the one it found stopped. */
export async function stopSandbox(
	providerSandboxId: string,
): Promise<{ sessionId: string | null }> {
	const sandbox = await getSandbox(providerSandboxId);
	if (!sandbox) return { sessionId: null };
	const sessionId = sessionIdOf(sandbox);
	if (sandbox.status === "running") await sandbox.stop();
	return { sessionId };
}

export interface BoxSession {
	id: string;
	memoryMb: number;
	vcpus: number;
	startedAt: number;
	endedAt: number | null;
	activeCpuMs: number | null;
}

const LIVE_STATUSES = new Set(["pending", "running"]);
const SESSION_PAGE_SIZE = 20;

export function sessionEndedAt(session: {
	status: string;
	stoppedAt?: number;
	abortedAt?: number;
	requestedStopAt?: number;
	updatedAt: number;
}): number | null {
	if (LIVE_STATUSES.has(session.status)) return null;
	return (
		session.stoppedAt ??
		session.abortedAt ??
		session.requestedStopAt ??
		session.updatedAt
	);
}

interface RawSession {
	id: string;
	memory: number;
	vcpus: number;
	status: string;
	startedAt?: number;
	stoppedAt?: number;
	abortedAt?: number;
	requestedStopAt?: number;
	updatedAt: number;
	activeCpuDurationMs?: number;
}

function toBoxSession(session: RawSession): BoxSession | null {
	if (session.startedAt === undefined) return null;
	return {
		id: session.id,
		memoryMb: session.memory,
		vcpus: session.vcpus,
		startedAt: session.startedAt,
		endedAt: sessionEndedAt(session),
		activeCpuMs: session.activeCpuDurationMs ?? null,
	};
}

/** Null when the sandbox no longer exists. */
export async function findSandboxSession(
	providerSandboxId: string,
	sessionId: string | null,
): Promise<{ session: BoxSession | null } | null> {
	const sandbox = await getSandbox(providerSandboxId);
	if (!sandbox) return null;
	for await (const raw of await sandbox.listSessions({
		sortOrder: "desc",
		limit: SESSION_PAGE_SIZE,
	})) {
		const session = toBoxSession(raw);
		if (session && (sessionId === null || session.id === sessionId)) {
			return { session };
		}
	}
	return { session: null };
}

const SESSION_MAX_MS = 24 * 60 * 60 * 1000;
const UNSETTLED_SANDBOX_STATUSES = new Set([
	"pending",
	"running",
	"stopping",
	"snapshotting",
]);

export interface ActiveWorkspaceSandbox {
	name: string;
	/** When the running session ends unless extended; null when it is not running. */
	expiresAt: Date | null;
	sessionId: string | null;
}

export async function listActiveWorkspaceSandboxes(
	since: number,
): Promise<ActiveWorkspaceSandbox[]> {
	const found: ActiveWorkspaceSandbox[] = [];
	const oldestRunning = Date.now() - SESSION_MAX_MS;
	// Vercel's tag filter uses creation-order pagination instead of statusUpdatedAt.
	for await (const sandbox of await Sandbox.list({
		...credentials(),
		sortBy: "statusUpdatedAt",
		sortOrder: "desc",
	})) {
		const updatedAt = sandbox.statusUpdatedAt ?? sandbox.updatedAt;
		if (updatedAt < oldestRunning) break;
		if (sandbox.tags?.kind !== "workspace") continue;
		if (UNSETTLED_SANDBOX_STATUSES.has(sandbox.status) || updatedAt >= since) {
			found.push({
				name: sandbox.name,
				expiresAt:
					sandbox.status === "running" && sandbox.expiresAt
						? new Date(sandbox.expiresAt)
						: null,
				sessionId: sandbox.currentSessionId ?? null,
			});
		}
	}
	return found;
}

/** Best-effort: a sandbox already gone is the state we wanted. */
export async function deleteSandbox(providerSandboxId: string): Promise<void> {
	const sandbox = await getSandbox(providerSandboxId);
	if (!sandbox) return;
	// Snapshots outlive a sandbox by default and keep billing storage.
	await sandbox.delete({ deleteOrphanSnapshots: true });
}

/**
 * A sandbox deleted while it holds its drive read-write leaves the drive
 * attached for minutes, so the box is stopped and the drive released first.
 * Throws while the drive is still attached; the caller retries.
 */
export async function deleteSandboxAndDrive(
	providerSandboxId: string,
	driveName: string | null | undefined,
	drives: DriveHost = vercelDrives(),
): Promise<void> {
	if (!driveName) return deleteSandbox(providerSandboxId);
	await stopSandbox(providerSandboxId);
	await waitForDriveDetached(driveName, { drives });
	await deleteSandbox(providerSandboxId);
	await deleteWorkspaceDrive(driveName, drives);
}
