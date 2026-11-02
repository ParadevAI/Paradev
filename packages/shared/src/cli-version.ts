import semver from "semver";

/** CLI builds older than this get an error asking them to update. Null: no floor. */
export const MINIMUM_CLI_VERSION: string | null = null;

/** CLI builds older than this are told an update is available. Null: no notice. */
export const RECOMMENDED_CLI_VERSION: string | null = null;

export const CLI_UPDATE_HEADER = "x-superset-update";

export type CliUpdate = "required" | "recommended" | null;

export function cliUpdateFor(
	version: string,
	floors: { minimum: string | null; recommended: string | null } = {
		minimum: MINIMUM_CLI_VERSION,
		recommended: RECOMMENDED_CLI_VERSION,
	},
): CliUpdate {
	if (!semver.valid(version)) return null;
	if (floors.minimum && semver.lt(version, floors.minimum)) return "required";
	if (floors.recommended && semver.lt(version, floors.recommended)) {
		return "recommended";
	}
	return null;
}
