/** Executable names installed next to `bin/superset` that run the same binary. */
export const CLI_BIN_ALIASES = ["paradev"] as const;

/** Every name a shell can run the CLI as; completion registers all of them. */
export const CLI_COMMAND_NAMES: readonly string[] = [
	"superset",
	...CLI_BIN_ALIASES,
];
