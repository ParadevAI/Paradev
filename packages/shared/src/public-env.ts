export const LEGACY_ENV_PREFIX = "SUPERSET_";
export const ENV_PREFIX = "PARADEV_";

/** What the platform sets in every box and terminal. */
export const IDENTITY_ENV_NAMES = [
	"TERMINAL_ID",
	"PANE_ID",
	"TAB_ID",
	"ORGANIZATION_ID",
	"WORKSPACE_ID",
	"WORKSPACE_NAME",
	"WORKSPACE_PATH",
	"ROOT_PATH",
	"SANDBOX_WORKSPACE_ID",
	"ENV",
	"HOST_AGENT_HOOK_URL",
	"HOME_DIR",
] as const;

/**
 * Variables that terminals, agents and scripts may see under both prefixes.
 * The `SUPERSET_` name is never removed: released CLIs and hook scripts
 * already on disk read only that one.
 */
export const PUBLIC_ENV_NAMES = [
	...IDENTITY_ENV_NAMES,
	"API_KEY",
	"API_URL",
] as const;

export type PublicEnvName = (typeof PUBLIC_ENV_NAMES)[number];

/** The `PARADEV_` names a user value must not override. */
export const RESERVED_PARADEV_ENV_KEYS: readonly string[] =
	IDENTITY_ENV_NAMES.map((name) => `${ENV_PREFIX}${name}`);

type EnvSource = Record<string, string | undefined>;

/**
 * The `SUPERSET_` value when it is non-empty, else the `PARADEV_` value. The
 * old name wins so overrides in existing scripts and profiles keep working.
 */
export function readPublicEnv(
	name: PublicEnvName,
	env: EnvSource = process.env,
): string | undefined {
	return env[`${LEGACY_ENV_PREFIX}${name}`] || env[`${ENV_PREFIX}${name}`];
}

/** Sets `PARADEV_<name>` to the value of every `SUPERSET_<name>` in env. */
export function addPublicEnvAliases<T extends EnvSource>(env: T): T {
	for (const name of PUBLIC_ENV_NAMES) {
		const value = env[`${LEGACY_ENV_PREFIX}${name}`];
		if (value !== undefined) {
			(env as EnvSource)[`${ENV_PREFIX}${name}`] = value;
		}
	}
	return env;
}

export function publicEnvPair(
	name: PublicEnvName,
	value: string,
): Record<string, string> {
	return {
		[`${LEGACY_ENV_PREFIX}${name}`]: value,
		[`${ENV_PREFIX}${name}`]: value,
	};
}
