import { PluginError } from "@superset/agent-setup";
import { CLIError } from "@superset/cli-framework";

function commandHint(error: PluginError): string | undefined {
	switch (error.code) {
		case "not-found":
			return "Run: superset plugins list --available";
		case "ambiguous":
			return `Name one with --marketplace <name>, or ${error.plugin}@<marketplace>.`;
		case "already-installed":
			return `Run: superset plugins install ${error.plugin} --update`;
		case "not-installed":
			return `Run: superset plugins install ${error.plugin}`;
		case "marketplace-not-installed":
			return "Run: superset plugins marketplace add <owner/repo>";
		default:
			return undefined;
	}
}

export function toCliError(error: unknown): unknown {
	if (!(error instanceof PluginError)) return error;
	const hint = [error.suggestion, commandHint(error)].filter(Boolean).join(" ");
	return new CLIError(error.message, hint || undefined);
}

/** Runs a plugin change, giving its errors the command to run next. */
export async function withPluginHints<T>(work: () => Promise<T>): Promise<T> {
	try {
		return await work();
	} catch (error) {
		throw toCliError(error);
	}
}
