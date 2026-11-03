import type {
	EnvironmentBuildKind,
	EnvironmentBuildStatus,
} from "@superset/db/schema";
import {
	SANDBOX_ROOT_CHECKOUT,
	sandboxCheckoutDir,
	sandboxRepositoryPath,
} from "@superset/shared/sandbox-contract";

export const KEPT_GOLDENS = 5;
export const STALE_BUILD_MS = 10 * 60 * 1000;
export const DAILY_PAUSE_AFTER_FAILURES = 3;
const FAILURE_TAIL_LINES = 40;

/** The job may run 300 s; checkout and snapshot get what is left before `jobMs`. */
export interface BuildBudgets {
	boxReadyMs: number;
	installMs: number;
	jobMs: number;
}

export const DEFAULT_BUILD_BUDGETS: BuildBudgets = {
	boxReadyMs: 45_000,
	installMs: 180_000,
	jobMs: 285_000,
};

/** An environment without a golden can only be built from the image. */
export function buildKind(sourceKind: "image" | "fork"): EnvironmentBuildKind {
	return sourceKind === "image" ? "fresh" : "incremental";
}

type CheckoutRepository = { id: string; owner: string; name: string };

/**
 * A repository change a fork cannot absorb: another primary, or a kept
 * repository whose checkout moves (one repository sits at the root, several
 * in subdirectories, and a name clash adds the owner).
 */
export function checkoutLayoutMoves(args: {
	current: readonly CheckoutRepository[];
	currentPrimaryId: string | null;
	next: readonly CheckoutRepository[];
	nextPrimaryId: string;
}): boolean {
	if (args.currentPrimaryId !== args.nextPrimaryId) return true;
	return args.next.some((repository) => {
		const before = args.current.find((row) => row.id === repository.id);
		return (
			before !== undefined &&
			sandboxRepositoryPath(before, args.current) !==
				sandboxRepositoryPath(repository, args.next)
		);
	});
}

/** Checkout paths of repositories the build no longer checks out. */
export function removedCheckoutPaths(args: {
	current: readonly CheckoutRepository[];
	nextIds: readonly string[];
}): string[] {
	return args.current
		.filter((repository) => !args.nextIds.includes(repository.id))
		.map((repository) => sandboxRepositoryPath(repository, args.current))
		.filter((path) => path !== SANDBOX_ROOT_CHECKOUT);
}

/** A running build whose job died never finishes on its own. */
export function isStale(
	build: { status: EnvironmentBuildStatus; startedAt: Date },
	now: number,
): boolean {
	return (
		build.status === "running" &&
		now - build.startedAt.getTime() > STALE_BUILD_MS
	);
}

/** Kept goldens past the newest `keep`, never the active one. Builds newest first. */
export function goldensToDelete<
	T extends {
		status: EnvironmentBuildStatus;
		goldenRef: string | null;
		goldenDeletedAt: Date | null;
	},
>(builds: readonly T[], activeRef: string, keep = KEPT_GOLDENS): T[] {
	const kept = builds.filter(
		(build) =>
			build.status === "succeeded" &&
			build.goldenRef !== null &&
			build.goldenDeletedAt === null,
	);
	return kept.slice(keep).filter((build) => build.goldenRef !== activeRef);
}

/** Finished builds, newest first. */
export function dailyBuildsPaused(
	finished: ReadonlyArray<{ status: EnvironmentBuildStatus }>,
): boolean {
	const recent = finished.slice(0, DAILY_PAUSE_AFTER_FAILURES);
	return (
		recent.length === DAILY_PAUSE_AFTER_FAILURES &&
		recent.every((build) => build.status === "failed")
	);
}

function quote(value: string): string {
	return `'${value.replaceAll("'", `'\\''`)}'`;
}

export interface BuildCheckout {
	url: string;
	branch: string;
	path: string;
}

/**
 * Brings every checkout to the tip of its branch: a fetch into a checkout
 * the box already has, else a clone moved into place the way the boot runner
 * does it. Prints the primary's commit last.
 */
export function checkoutScript(args: {
	root: string;
	checkouts: readonly BuildCheckout[];
	remove?: readonly string[];
}): string {
	const lines = ["set -euo pipefail"];
	for (const path of args.remove ?? []) {
		lines.push(`rm -rf ${quote(sandboxCheckoutDir(args.root, path))}`);
	}
	for (const checkout of args.checkouts) {
		const dir = quote(sandboxCheckoutDir(args.root, checkout.path));
		const url = quote(checkout.url);
		const branch = quote(checkout.branch);
		lines.push(
			`mkdir -p ${dir}`,
			`if [ -d ${dir}/.git ] && [ "$(git -C ${dir} remote get-url origin 2>/dev/null)" = ${url} ]; then`,
			`  git -C ${dir} fetch -q --depth 1 origin ${branch}`,
			`  git -C ${dir} checkout -q -f -B ${branch} FETCH_HEAD`,
			"else",
			`  tmp="$(mktemp -d ${quote(args.root)}/.clone.XXXXXX)"`,
			`  git clone -q --depth 1 --single-branch --branch ${branch} ${url} "$tmp"`,
			`  find ${dir} -mindepth 1 -maxdepth 1 ! -name '.clone.*' -exec rm -rf {} +`,
			`  (shopt -s dotglob nullglob; for entry in "$tmp"/*; do mv "$entry" ${dir}/; done)`,
			`  rmdir "$tmp"`,
			"fi",
		);
	}
	const primary = args.checkouts[0];
	if (primary) {
		lines.push(
			`git -C ${quote(sandboxCheckoutDir(args.root, primary.path))} rev-parse HEAD`,
		);
	}
	return lines.join("\n");
}

export function installScript(commands: readonly string[]): string {
	return ["set -euo pipefail", ...commands].join("\n");
}

export function failureTail(output: string): string {
	return output.trimEnd().split("\n").slice(-FAILURE_TAIL_LINES).join("\n");
}
