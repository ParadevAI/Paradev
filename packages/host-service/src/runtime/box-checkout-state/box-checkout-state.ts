import { readFile } from "node:fs/promises";
import { sandboxCheckoutDir } from "@superset/shared/sandbox-contract";

/** A checkout the boot runner has not put in place on this boot; absent once it is in. */
export type BoxCheckoutState =
	| { state: "cloning" }
	| { state: "failed"; reason: "base_missing"; baseBranch: string }
	| { state: "failed"; reason: "clone_failed" };

export type BoxCheckoutStateLookup = (
	checkoutPath: string,
) => BoxCheckoutState | undefined;

const DONE = new Set([
	"checkout.skipped",
	"checkout.fetched",
	"checkout.cloned",
]);
const none: BoxCheckoutStateLookup = () => undefined;

/** Reads the current boot's `checkout.*` stamps that `superset-boot` writes per repository path. */
export function boxCheckoutStatesFromLog(
	log: string,
	workspaceRoot: string,
): BoxCheckoutStateLookup {
	let booted = false;
	let ended = false;
	let outcomes = new Map<string, BoxCheckoutState | null>();
	for (const line of log.split("\n")) {
		const [at, phase, path, detail] = line.trim().split(" ");
		if (!at || !/^\d{13}$/.test(at) || !phase) continue;
		if (phase === "boot.start") {
			booted = true;
			ended = false;
			outcomes = new Map();
		} else if (phase === "checkout.end") {
			ended = true;
		} else if (path && DONE.has(phase)) {
			outcomes.set(sandboxCheckoutDir(workspaceRoot, path), null);
		} else if (path && phase === "checkout.base.missing" && detail) {
			outcomes.set(sandboxCheckoutDir(workspaceRoot, path), {
				state: "failed",
				reason: "base_missing",
				baseBranch: detail,
			});
		} else if (path && phase === "checkout.clone.failed") {
			outcomes.set(sandboxCheckoutDir(workspaceRoot, path), {
				state: "failed",
				reason: "clone_failed",
			});
		}
	}
	if (!booted) return none;
	return (checkoutPath) => {
		const outcome = outcomes.get(checkoutPath);
		if (outcome !== undefined) return outcome ?? undefined;
		return ended ? undefined : { state: "cloning" };
	};
}

/** Only the box's own workspace has checkouts the boot runner makes. */
export async function readBoxCheckoutStates(
	workspaceId: string,
	env: NodeJS.ProcessEnv = process.env,
): Promise<BoxCheckoutStateLookup> {
	const root = env.SUPERSET_SANDBOX_WORKSPACE_PATH;
	const logPath = env.SUPERSET_SANDBOX_BOOT_LOG;
	if (
		env.SUPERSET_HOST_RUN_MODE !== "sandbox" ||
		env.SUPERSET_SANDBOX_WORKSPACE_ID !== workspaceId ||
		!root ||
		!logPath
	)
		return none;
	try {
		return boxCheckoutStatesFromLog(await readFile(logPath, "utf8"), root);
	} catch {
		return none;
	}
}
