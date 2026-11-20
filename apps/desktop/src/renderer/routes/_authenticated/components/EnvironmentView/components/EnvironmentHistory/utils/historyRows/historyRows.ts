import type { EnvironmentBuild } from "../environmentBuildMeta";

/** The newest builds, plus any older snapshot that is still current or can be restored. */
export function historyRows<
	T extends Pick<EnvironmentBuild, "active" | "restorable">,
>(builds: readonly T[], recent: number): T[] {
	return builds.filter(
		(build, index) => index < recent || build.active || build.restorable,
	);
}
