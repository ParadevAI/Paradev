import type {
	EnvironmentBuildStatus,
	EnvironmentBuildTrigger,
} from "@superset/db/schema";
import { sandboxCheckoutDir } from "@superset/shared/sandbox/contract";
import {
	FRESH_REBUILDS_AT_ONCE,
	FRESH_REBUILDS_PER_HOUR,
	KEPT_GOLDENS,
	STALE_BUILD_MS,
} from "./limits";

export const DAILY_PAUSE_AFTER_FAILURES = 3;

/** A running build whose workflow died never finishes on its own. */
export function isStale(build: {
	status: EnvironmentBuildStatus;
	startedAt: Date;
}): boolean {
	return (
		build.status === "running" &&
		Date.now() - build.startedAt.getTime() > STALE_BUILD_MS
	);
}

/**
 * Goldens past the active one and the `KEPT_GOLDENS - 1` newest others.
 * Takes undeleted goldens, newest first; never returns the active one.
 */
export function goldensToDelete<T extends { goldenRef: string }>(
	goldens: readonly T[],
	activeRef: string,
): T[] {
	return goldens
		.filter((golden) => golden.goldenRef !== activeRef)
		.slice(KEPT_GOLDENS - 1);
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

/** `wait` while fresh rebuilds are at the cap but the hour has room; only a daily build waits. */
export type FreshRebuildClaim = "claimed" | "wait" | "refused";

export function freshRebuildClaim(args: {
	running: number;
	startedLastHour: number;
	trigger: EnvironmentBuildTrigger;
}): FreshRebuildClaim {
	if (args.startedLastHour >= FRESH_REBUILDS_PER_HOUR) return "refused";
	if (args.running < FRESH_REBUILDS_AT_ONCE) return "claimed";
	return args.trigger === "daily" ? "wait" : "refused";
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
}): string {
	const lines = ["set -euo pipefail"];
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
