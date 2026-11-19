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

import * as Sentry from "@sentry/core";
import {
	type BootStamp,
	parseBootStamps,
} from "@superset/shared/sandbox/boot-stamps";
import {
	renderSandboxConf,
	SANDBOX_PATHS,
	SANDBOX_PORTS,
	SANDBOX_PUBLISHED_PORTS,
	type SandboxIdentity,
	sandboxAgentToolsDrive,
} from "@superset/shared/sandbox/contract";
import {
	APIError,
	Drive,
	type NetworkPolicy,
	Sandbox,
	type SandboxMounts,
	type SandboxRegion,
} from "@vercel/sandbox";
import { env } from "../../env";
import { bootStampsFrom, type HostAnswer } from "./boot-trace";
import {
	CODEX_AUTH_PATH,
	CODEX_SYSTEM_CONFIG_PATH,
	type SandboxFile,
} from "./credentials";
import { sandboxDeletesAllowed } from "./deletes";

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
/** 2 GB of memory per vCPU; disk is 64 GB regardless. */
export const MEMORY_MB_PER_VCPU = 2048;
const GOLDEN_SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const BOOT_COMMAND = "/usr/local/bin/superset-boot";
const HOST_PROBE_TIMEOUT_MS = 1_500;

function credentials() {
	return {
		token: env.VERCEL_SANDBOX_TOKEN,
		teamId: env.VERCEL_SANDBOX_TEAM_ID,
		projectId: env.VERCEL_SANDBOX_PROJECT_ID,
	};
}

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
		cause?: unknown,
	) {
		super(`Sandbox ${providerSandboxId} is unavailable`, { cause });
	}

	get snapshotExpired(): boolean {
		return this.cause instanceof APIError && this.cause.response.status === 410;
	}
}

function isUnavailable(error: unknown): boolean {
	return (
		error instanceof APIError &&
		(error.response.status === 404 || error.response.status === 410)
	);
}

/** Vercel starts a new session on every resume, so the id tells a stale record from a fresh one. */
function sessionIdOf(sandbox: Pick<Sandbox, "currentSession">): string | null {
	try {
		return sandbox.currentSession().sessionId;
	} catch {
		return null;
	}
}

/** The session ended under the call: the SDK's own resume-and-retry case. */
function isSessionStopped(error: unknown): boolean {
	if (!(error instanceof APIError)) return false;
	if (error.response.status === 410) return true;
	const code = (error.json as { error?: { code?: string } } | undefined)?.error
		?.code;
	return (
		error.response.status === 422 &&
		(code === "sandbox_stopping" || code === "sandbox_snapshotting")
	);
}

/**
 * Most of a handle's calls resume a stopped session and retry. Only a wake
 * or a create may do that, so every other caller gets the members that
 * cannot, and acts on a running session through `currentSession()`, whose
 * calls fail on a stopped one instead.
 */
type NonResumingSandbox = Pick<
	Sandbox,
	| "name"
	| "status"
	| "region"
	| "vcpus"
	| "expiresAt"
	| "currentSnapshotId"
	| "domain"
	| "currentSession"
	| "update"
	| "stop"
	| "delete"
	| "listSessions"
>;

/** A handle whose calls resume a stopped session: for a wake or a create only. */
async function getSandboxToWake(
	name: string,
	onResume?: (sandbox: Sandbox) => Promise<void>,
): Promise<Sandbox | null> {
	try {
		return await Sandbox.get({
			...credentials(),
			name,
			resume: false,
			onResume,
		});
	} catch (error) {
		if (isNotFound(error)) return null;
		throw error;
	}
}

const getSandbox: (name: string) => Promise<NonResumingSandbox | null> =
	getSandboxToWake;

export interface SandboxEnvironment {
	sourceKind: "image" | "fork";
	sourceRef: string;
	region: string;
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
	/** Mount the bundle's agent-tools drive read-only; absent keeps the image's agents. */
	agentTools?: boolean;
}

function environmentTags(organizationId: string): Record<string, string> {
	return { kind: "environment", org: organizationId };
}

/** Vercel allows 5 tags per sandbox. */
function sandboxTags(
	kind: "workspace" | "environment",
	identity: SandboxIdentity,
): Record<string, string> {
	const org = identity.SUPERSET_SANDBOX_ORGANIZATION_ID;
	// A golden's identity is the workspace it was built from, not its own.
	if (kind === "environment") return environmentTags(org);
	const user = identity.SUPERSET_SANDBOX_CREATOR_USER_ID;
	return {
		kind,
		org,
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

/** The box's own region names the drive: a workspace stays where it was created when its environment moves. */
export function agentToolsDriveName(
	claim: Pick<SandboxClaim, "agentTools" | "identity">,
	region: string,
): string | null {
	return claim.agentTools
		? sandboxAgentToolsDrive(region, claim.identity.SUPERSET_BUNDLE_SHA)
		: null;
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
async function runBoot(sandbox: Sandbox, hostSecret: string): Promise<void> {
	await sandbox.runCommand({
		cmd: "sudo",
		args: ["--preserve-env=HOST_SERVICE_SECRET", BOOT_COMMAND],
		detached: true,
		env: { HOST_SERVICE_SECRET: hostSecret },
	});
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
	kind?: "workspace" | "environment";
}): Promise<{
	providerSandboxId: string;
	sandboxUrl: string;
	hostTarget: string;
	expiresAt: Date | null;
	sessionId: string | null;
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
		// Vercel never expires a snapshot: the retention reaper decides when a box goes.
		snapshotExpiration: 0,
		keepLastSnapshots: { count: 1 },
		tags: sandboxTags(kind, args.claim.identity),
	};
	const mounts = await agentToolsMounts(
		agentToolsDriveName(args.claim, args.environment.region),
	);
	const sandbox =
		(await getSandboxToWake(args.name)) ??
		(await Sentry.startSpan(
			{
				name:
					args.environment.sourceKind === "fork" ? "fork" : "create from image",
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
	await Sentry.startSpan({ name: "start boot", op: "sandbox" }, async () => {
		await writeIdentity(sandbox, args.claim.identity);
		await writeSignInFiles(sandbox, args.claim.files);
		await runBoot(sandbox, args.claim.hostSecret);
	});
	return {
		providerSandboxId: args.name,
		sandboxUrl: sandbox.domain(HOST_SERVICE_PORT),
		hostTarget: sandbox.domain(HOST_SERVICE_PORT),
		expiresAt: sandbox.expiresAt ?? null,
		sessionId: sessionIdOf(sandbox),
	};
}

const HOST_READY_TIMEOUT_MS = 60_000;
const HOST_READY_POLL_MS = 100;

/** The boot's phases only: the lines between the stamps are step output. */
export class SandboxNotReadyError extends Error {
	constructor(providerSandboxId: string, bootStamps: BootStamp[] | null) {
		const start = bootStamps?.[0]?.at ?? 0;
		const reached = bootStamps
			? bootStamps
					.map((stamp) => `${stamp.phase} +${stamp.at - start}ms`)
					.join(", ") || "no phase"
			: "an unreadable boot log";
		super(
			`host-service in ${providerSandboxId} did not answer in time; the boot reached ${reached}`,
		);
		this.name = "SandboxNotReadyError";
	}
}

async function readBoxBootStamps(name: string): Promise<BootStamp[] | null> {
	const sandbox = await getSandbox(name);
	const log = await sandbox
		?.currentSession()
		.readFileToBuffer(
			{ path: SANDBOX_PATHS.bootLog },
			{ signal: AbortSignal.timeout(10_000) },
		);
	return log ? parseBootStamps(log.toString("utf8")) : null;
}

async function waitForHostService(
	target: string,
	providerSandboxId: string,
): Promise<HostAnswer> {
	const deadline = Date.now() + HOST_READY_TIMEOUT_MS;
	while (Date.now() < deadline) {
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
	throw new SandboxNotReadyError(
		providerSandboxId,
		await readBoxBootStamps(providerSandboxId).catch(() => null),
	);
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
}): Promise<HostAnswer> {
	const answer = await waitForHostService(
		args.hostTarget,
		args.providerSandboxId,
	);
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
	const sandbox = await getSandbox(args.providerSandboxId);
	if (sandbox?.status !== "running") return "not-running";
	try {
		await sandbox.update({ networkPolicy: args.networkPolicy });
	} catch (error) {
		if (isSessionStopped(error)) return "not-running";
		throw error;
	}
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
		const sandbox = await getSandbox(providerSandboxId);
		if (!sandbox) throw new SandboxUnavailableError(providerSandboxId);
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
		try {
			await sandbox.currentSession().extendTimeout(extension);
		} catch (error) {
			if (isSessionStopped(error)) return null;
			throw error;
		}
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
export async function wakeSandbox(args: {
	providerSandboxId: string;
	claim: SandboxClaim;
	/** A stopped box is left stopped, and the wake answers null. */
	onlyIfRunning?: boolean;
	/**
	 * Runs once the box is known to be stopped, before anything resumes it; or,
	 * for a box read running that a call here resumed (`resumedSession`), once
	 * those calls end.
	 */
	beforeResume?: (box: {
		memoryMb: number;
		vcpus: number;
		resumedSession?: { sessionId: string | null; expiresAt: Date | null };
	}) => Promise<void>;
}): Promise<{
	hostTarget: string;
	/** The session was stopped, so every process on the box started from this claim. */
	booted: boolean;
	/** The boot command ran: the session was stopped, or host-service in it had stopped answering. */
	rebooted: boolean;
	answer: HostAnswer;
	expiresAt: Date | null;
	sessionId: string | null;
} | null> {
	try {
		let wasRunning = false;
		let resumed = null as { vcpus: number; sessionId: string | null } | null;
		const sandbox = await getSandboxToWake(
			args.providerSandboxId,
			async (box) => {
				if (!wasRunning) return;
				const session = box.currentSession();
				resumed = { vcpus: session.vcpus, sessionId: session.sessionId };
			},
		);
		if (!sandbox) throw new SandboxUnavailableError(args.providerSandboxId);
		const hostTarget = sandbox.domain(HOST_SERVICE_PORT);
		wasRunning = sandbox.status === "running";
		if (args.onlyIfRunning && !wasRunning) return null;
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
		if (!wasRunning) {
			const { [SANDBOX_PATHS.agents]: previous, ...others } =
				sandbox.mounts ?? {};
			const agents = await agentToolsMounts(
				agentToolsDriveName(args.claim, sandbox.region),
			);
			if (agents || previous) {
				await sandbox
					.update({ mounts: { ...others, ...agents } })
					.catch((error) =>
						console.warn(
							`[sandbox] mount update failed for ${args.providerSandboxId}`,
							error,
						),
					);
			}
		}
		if (!wasRunning && args.beforeResume) {
			await args.beforeResume({ memoryMb: vcpus * MEMORY_MB_PER_VCPU, vcpus });
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
		const serving = wasRunning && (await hostServiceAnswers(hostTarget));
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
		if (!serving) {
			await Sentry.startSpan({ name: "start boot", op: "sandbox" }, () =>
				runBoot(sandbox, args.claim.hostSecret),
			);
		}
		if (resumed && args.beforeResume) {
			await args.beforeResume({
				memoryMb: resumed.vcpus * MEMORY_MB_PER_VCPU,
				vcpus: resumed.vcpus,
				resumedSession: {
					sessionId: resumed.sessionId,
					expiresAt: sandbox.expiresAt ?? null,
				},
			});
		}
		const answer = await Sentry.startSpan(
			{ name: "settle", op: "sandbox" },
			() =>
				settleSandbox({
					providerSandboxId: args.providerSandboxId,
					hostTarget,
					claim: args.claim,
				}),
		);
		return {
			hostTarget,
			booted: !wasRunning,
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

/** Removes what a box wrote for the workspace it was, so a fork starts clean. */
export async function stripWorkspaceIdentity(sandbox: Sandbox): Promise<void> {
	await sandbox.runCommand({
		cmd: "rm",
		args: ["-rf", ...INHERITED_IDENTITY],
		sudo: true,
	});
}

/**
 * Stops a sandbox and returns once the snapshot forks would start from is
 * current. What a release does to a golden it has finished building.
 */
/** Returns the session it stopped. */
export async function stopAndSnapshot(
	name: string,
): Promise<{ sessionId: string | null }> {
	const sandbox = await getSandbox(name);
	if (!sandbox) throw new SandboxUnavailableError(name);
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
 * Taking that snapshot ends the source's session. The source stays stopped:
 * the caller starts it again through a wake, which meters the new session.
 */
export async function promoteSandboxToEnvironment(args: {
	sourceSandbox: string;
	goldenName: string;
	organizationId: string;
}): Promise<{
	goldenName: string;
	region: string;
	/** The session the snapshot ended; null when the source was not running. */
	stopped: { sessionId: string | null } | null;
}> {
	const source = await getSandbox(args.sourceSandbox);
	if (!source) throw new SandboxUnavailableError(args.sourceSandbox);
	const stopped =
		source.status === "running" ? { sessionId: sessionIdOf(source) } : null;
	const golden = await Sandbox.create({
		...credentials(),
		name: args.goldenName,
		source: { type: "snapshot", snapshotId: await snapshotNow(source) },
		ports: publishedPorts(),
		timeout: GOLDEN_SESSION_TIMEOUT_MS,
		region: source.region as SandboxRegion,
		...(source.vcpus ? { resources: { vcpus: source.vcpus } } : {}),
		env: {},
		persistent: true,
		snapshotExpiration: 0,
		keepLastSnapshots: { count: 1 },
		tags: environmentTags(args.organizationId),
	});
	await stripWorkspaceIdentity(golden);
	const created = golden.currentSnapshotId;
	await golden.stop();
	await waitForStopSnapshot(args.goldenName, created);
	return { goldenName: args.goldenName, region: source.region, stopped };
}

/**
 * A running box's disk, snapshotted now; a stopped box's disk is the snapshot
 * its stop took, so it is not resumed to take another.
 */
async function snapshotNow(source: NonResumingSandbox): Promise<string> {
	if (source.status === "running") {
		try {
			return (await source.currentSession().snapshot()).snapshotId;
		} catch (error) {
			if (!isSessionStopped(error)) throw error;
		}
	} else if (source.status === "stopped") {
		if (source.currentSnapshotId) return source.currentSnapshotId;
		throw new SandboxUnavailableError(source.name);
	} else if (source.status !== "stopping" && source.status !== "snapshotting") {
		throw new SandboxUnavailableError(source.name);
	}
	return waitForStopSnapshot(source.name, source.currentSnapshotId);
}

/**
 * stop() returns while the sandbox is still `stopping`; a fork taken before
 * the stop's snapshot is current boots from whatever was current before.
 */
export async function waitForStopSnapshot(
	name: string,
	previous: string | undefined,
): Promise<string> {
	const deadline = Date.now() + 3 * 60 * 1000;
	while (Date.now() < deadline) {
		const sandbox = await getSandbox(name);
		if (!sandbox) throw new SandboxUnavailableError(name);
		const current = sandbox.currentSnapshotId;
		if (sandbox.status === "stopped" && current && current !== previous) {
			return current;
		}
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
	egressBytes: number | null;
	/** Vercel marked it failed or aborted; a timeout and our own stops both end as `stopped`. */
	crashed: boolean;
}

const LIVE_STATUSES = new Set(["pending", "running"]);
const CRASHED_STATUSES = new Set(["failed", "aborted"]);
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
	networkTransfer?: { ingress: number; egress: number };
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
		egressBytes: session.networkTransfer?.egress ?? null,
		crashed: CRASHED_STATUSES.has(session.status),
	};
}

/**
 * The box's sessions that are live or ended at or after `since`, newest
 * first. Null when the sandbox no longer exists.
 */
export async function listSandboxSessions(
	providerSandboxId: string,
	since: number,
): Promise<BoxSession[] | null> {
	const sandbox = await getSandbox(providerSandboxId);
	if (!sandbox) return null;
	const sessions: BoxSession[] = [];
	for await (const raw of await sandbox.listSessions({
		sortOrder: "desc",
		limit: SESSION_PAGE_SIZE,
	})) {
		const session = toBoxSession(raw);
		if (!session) continue;
		if (session.endedAt !== null && session.endedAt < since) break;
		sessions.push(session);
	}
	return sessions;
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

export interface ListedSandbox {
	name: string;
	createdAt: number;
	status: string;
	/** What it mounts, running or stopped: a stopped box mounts it again on its next boot. */
	mounts: string[];
}

export interface ListedDrive {
	name: string;
	createdAt: number;
	attachedTo: string | undefined;
}

const MAX_LISTING_PAGES = 10_000;

/**
 * Every page of a listing, or a throw: each page answered, no cursor seen
 * twice, and the names the caller knows exist all in it. A deleter that acts
 * on a partial listing deletes what it did not see named.
 */
export async function listWhole<T extends { name: string }>({
	fetchPage,
	expected = [],
	nonEmpty,
}: {
	fetchPage: (
		cursor: string | null,
	) => Promise<{ items: T[]; next: string | null }>;
	expected?: readonly string[];
	nonEmpty: boolean;
}): Promise<T[]> {
	const items: T[] = [];
	const seen = new Set<string>();
	let cursor: string | null = null;
	for (let pages = 0; ; pages++) {
		if (pages >= MAX_LISTING_PAGES) {
			throw new Error(`listing has more than ${pages} pages`);
		}
		const page = await fetchPage(cursor);
		items.push(...page.items);
		if (page.next === null) break;
		if (seen.has(page.next)) {
			throw new Error(`listing repeated cursor ${page.next.slice(0, 16)}`);
		}
		seen.add(page.next);
		cursor = page.next;
	}
	if (nonEmpty && items.length === 0) throw new Error("listing is empty");
	const names = new Set(items.map((item) => item.name));
	const missing = expected.filter((name) => !names.has(name));
	if (missing.length) throw new Error(`listing lacks ${missing.join(", ")}`);
	return items;
}

/** The page size #9943 used against the same endpoint. */
const LISTING_PAGE_SIZE = 50;

/** Every box in the project, whatever its status, tags or database; throws unless whole. */
export function listProjectSandboxes(
	expected: readonly string[],
): Promise<ListedSandbox[]> {
	return listWhole({
		expected,
		nonEmpty: true,
		fetchPage: async (cursor) => {
			const page = await Sandbox.list({
				...credentials(),
				limit: LISTING_PAGE_SIZE,
				...(cursor ? { cursor } : {}),
			});
			return {
				items: page.sandboxes.map((sandbox) => ({
					name: sandbox.name,
					createdAt: sandbox.createdAt,
					status: sandbox.status,
					mounts: Object.values(sandbox.mounts ?? {}).map(
						(mount) => mount.drive,
					),
				})),
				next: page.pagination.next,
			};
		},
	});
}

/** Every drive in the project; throws unless whole. */
export function listProjectDrives(): Promise<ListedDrive[]> {
	return listWhole({
		nonEmpty: false,
		fetchPage: async (cursor) => {
			const page = await Drive.list({
				...credentials(),
				limit: LISTING_PAGE_SIZE,
				...(cursor ? { cursor } : {}),
			});
			return {
				items: page.drives.map((drive) => ({
					name: drive.name,
					createdAt: drive.createdAt.getTime(),
					attachedTo: drive.currentSandboxName,
				})),
				next: page.pagination.next,
			};
		},
	});
}

/** Throws while a box holds it; a drive already gone is the state we wanted. */
export async function deleteDrive(name: string): Promise<void> {
	if (!sandboxDeletesAllowed(`drive ${name}`)) return;
	const drive = await Drive.get({ ...credentials(), name }).catch((error) => {
		if (isNotFound(error)) return null;
		throw error;
	});
	await drive?.delete();
}

/** Best-effort: a sandbox already gone is the state we wanted. */
export async function deleteSandbox(providerSandboxId: string): Promise<void> {
	const sandbox = await getSandbox(providerSandboxId);
	if (!sandbox) return;
	// Snapshots outlive a sandbox by default and keep billing storage.
	await sandbox.delete({ deleteOrphanSnapshots: true });
}
