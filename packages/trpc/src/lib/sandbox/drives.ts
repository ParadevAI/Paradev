import { FEATURE_FLAGS } from "@superset/shared/constants";
import {
	SANDBOX_PATHS,
	type SandboxIdentity,
} from "@superset/shared/sandbox/contract";
import {
	APIError,
	Drive,
	type SandboxMounts,
	type SandboxRegion,
} from "@vercel/sandbox";
import { credentials } from "./vercel-credentials";

/** Vercel allows one read-write mount per drive, so the whole drive sits at one path. */
export const WORKSPACE_DRIVE_MOUNT_PATH = SANDBOX_PATHS.drive;

export function workspaceDriveNameFor(providerSandboxId: string): string {
	return `drive-${providerSandboxId}`;
}

/**
 * Fork or nothing: a workspace has a drive exactly when its environment is
 * in drive mode, because the golden's root disk was built without /workspace.
 */
export function workspaceDriveNameToClaim(args: {
	existing: string | null;
	goldenDriveName: string | null | undefined;
	providerSandboxId: string;
}): string | null {
	if (args.existing) return args.existing;
	if (!args.goldenDriveName) return null;
	return workspaceDriveNameFor(args.providerSandboxId);
}

export function workspaceDriveIdentity(
	driveName: string | null | undefined,
	{ laidOut }: { laidOut: boolean },
): Pick<
	SandboxIdentity,
	"SUPERSET_SANDBOX_DRIVE" | "SUPERSET_SANDBOX_DRIVE_LAID_OUT"
> {
	if (!driveName) return {};
	return {
		SUPERSET_SANDBOX_DRIVE: driveName,
		...(laidOut ? { SUPERSET_SANDBOX_DRIVE_LAID_OUT: "1" as const } : {}),
	};
}

/**
 * The drive a claim names. Only a provision gives a workspace its
 * environment's drive, and only while the organization's flag is on; a wake
 * mounts the row's own drive or none, so a workspace made before its
 * environment entered drive mode boots exactly as it did. A wake expects the
 * drive laid out once the row recorded a boot that laid it out.
 */
export function claimedWorkspaceDrive(args: {
	row: {
		driveName: string | null;
		driveLaidOutAt: Date | null;
		providerSandboxId: string;
	};
	goldenDriveName: string | null | undefined;
	provisioning: boolean;
	drivesEnabled: boolean;
}): {
	driveName: string | null;
	identity: ReturnType<typeof workspaceDriveIdentity>;
} {
	if (!args.provisioning) {
		return {
			driveName: args.row.driveName,
			identity: workspaceDriveIdentity(args.row.driveName, {
				laidOut: args.row.driveLaidOutAt !== null,
			}),
		};
	}
	const driveName = workspaceDriveNameToClaim({
		existing: args.row.driveName,
		goldenDriveName: args.drivesEnabled ? args.goldenDriveName : null,
		providerSandboxId: args.row.providerSandboxId,
	});
	return {
		driveName,
		identity: workspaceDriveIdentity(driveName, { laidOut: false }),
	};
}

export function goldenDriveNameFor(goldenName: string): string {
	return `env-drive-${goldenName}`;
}

/** Vercel does not carry mounts from one session to the next, so every create and wake passes these. */
export function workspaceDriveMounts(
	driveName: string | null | undefined,
): SandboxMounts | undefined {
	if (!driveName) return undefined;
	return {
		[WORKSPACE_DRIVE_MOUNT_PATH]: { drive: driveName, mode: "read-write" },
	};
}

/**
 * Whether a golden build or a promote may put an organization's environment
 * in drive mode. Workspaces follow their environment's row, never this.
 * Fails closed: PostHog unreachable means no drive.
 */
export async function workspaceDrivesEnabled(
	organizationId: string,
): Promise<boolean> {
	// Lazily, so the release scripts that import this need no PostHog key.
	const { posthog } = await import("../analytics");
	const enabled = await posthog
		.isFeatureEnabled(FEATURE_FLAGS.CLOUD_WORKSPACE_DRIVES, organizationId, {
			groups: { organization: organizationId },
			sendFeatureFlagEvents: false,
		})
		.catch(() => undefined);
	return enabled === true;
}

/** What drive bookkeeping needs from the provider; `vercelDrives` is the real one. */
export interface DriveHost {
	/** Null when no drive has the name. */
	find(name: string): Promise<{ region: string; attachedTo?: string } | null>;
	create(name: string, region: string): Promise<void>;
	fork(source: string, name: string): Promise<void>;
	/** Throws while the drive is attached to a sandbox. */
	remove(name: string): Promise<void>;
}

function isNotFound(error: unknown): boolean {
	return error instanceof APIError && error.response.status === 404;
}

export function vercelDrives(): DriveHost {
	const get = async (name: string) => {
		try {
			return await Drive.get({ ...credentials(), name });
		} catch (error) {
			if (isNotFound(error)) return null;
			throw error;
		}
	};
	return {
		async find(name) {
			const drive = await get(name);
			return drive
				? { region: drive.region, attachedTo: drive.currentSandboxName }
				: null;
		},
		async create(name, region) {
			await Drive.getOrCreate({
				...credentials(),
				name,
				region: region as SandboxRegion,
			});
		},
		async fork(source, name) {
			const parent = await Drive.get({ ...credentials(), name: source });
			await parent.fork({ name });
		},
		async remove(name) {
			await (await get(name))?.delete();
		},
	};
}

/**
 * The workspace's drive, forked from its environment's golden drive. Forks
 * are copy-on-write and near instant. Idempotent on the name, so a
 * re-delivered provision finds the drive it already made.
 */
export async function forkWorkspaceDrive(args: {
	name: string;
	region: string;
	goldenDriveName: string | null;
	drives?: DriveHost;
}): Promise<"existing" | "forked"> {
	const drives = args.drives ?? vercelDrives();
	if (await drives.find(args.name)) return "existing";
	if (!args.goldenDriveName) {
		throw new Error(
			`Drive ${args.name} is missing and its environment has no golden drive to fork`,
		);
	}
	const golden = await drives.find(args.goldenDriveName);
	if (!golden) {
		throw new Error(`Golden drive ${args.goldenDriveName} does not exist`);
	}
	if (golden.region !== args.region) {
		throw new Error(
			`Golden drive ${args.goldenDriveName} is in ${golden.region}; the sandbox runs in ${args.region}`,
		);
	}
	await drives.fork(args.goldenDriveName, args.name);
	return "forked";
}

/**
 * A drive already gone is the state we wanted. Throws while the drive is
 * still attached, so the caller stops its sandbox first and retries.
 */
export async function deleteWorkspaceDrive(
	name: string | null | undefined,
	drives: DriveHost = vercelDrives(),
): Promise<void> {
	if (!name) return;
	await drives.remove(name);
}

export const DRIVE_DETACH_TIMEOUT_MS = 2 * 60 * 1000;

export class DriveStillAttachedError extends Error {
	constructor(
		readonly driveName: string,
		readonly sandboxName: string,
	) {
		super(
			`Drive ${driveName} is still attached to ${sandboxName}; the previous session has not finished writing it`,
		);
		this.name = "DriveStillAttachedError";
	}
}

/**
 * A session that stops keeps its drive attached while it flushes, and a mount
 * taken meanwhile reads a corrupt or empty filesystem.
 */
export async function waitForDriveDetached(
	driveName: string,
	options: {
		drives?: DriveHost;
		timeoutMs?: number;
		pollMs?: number;
		/** Whether the sandbox holding the drive is the one about to mount it, already running. */
		heldByCaller?: (attachedTo: string) => Promise<boolean>;
	} = {},
): Promise<"detached" | "held"> {
	const drives = options.drives ?? vercelDrives();
	const deadline = Date.now() + (options.timeoutMs ?? DRIVE_DETACH_TIMEOUT_MS);
	for (;;) {
		const drive = await drives.find(driveName);
		if (!drive?.attachedTo) return "detached";
		if (await options.heldByCaller?.(drive.attachedTo)) return "held";
		if (Date.now() >= deadline) {
			throw new DriveStillAttachedError(driveName, drive.attachedTo);
		}
		await new Promise((resolve) => setTimeout(resolve, options.pollMs ?? 2000));
	}
}
