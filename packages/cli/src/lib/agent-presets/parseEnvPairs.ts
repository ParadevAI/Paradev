import { CLIError } from "@superset/cli-framework";

/**
 * Parse repeatable `--env KEY=VALUE` flags into the record the host stores.
 *
 * Split on the first `=` only, so values may contain `=` (a connection
 * string, a base64 token). A later pair wins over an earlier one with the
 * same key, matching how a shell's own `KEY=v1 KEY=v2` assignment behaves.
 */
export function parseEnvPairs(pairs: string[]): Record<string, string> {
	const env: Record<string, string> = {};
	for (const pair of pairs) {
		const separator = pair.indexOf("=");
		const key = separator === -1 ? "" : pair.slice(0, separator).trim();
		if (!key) {
			throw new CLIError(
				`Invalid --env value: ${JSON.stringify(pair)}`,
				"Pass KEY=VALUE, e.g. --env ANTHROPIC_LOG=debug",
			);
		}
		env[key] = pair.slice(separator + 1);
	}
	return env;
}
