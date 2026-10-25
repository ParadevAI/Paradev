import { CLIError } from "@superset/cli-framework";

const LIMIT_REACHED = "serverError.environment.limitReached";

/** Rethrows the API's environment-limit refusal with a hint that names CLI commands, not app settings. */
export function environmentLimitHint(error: unknown): never {
	const data = (error as { data?: { i18nKey?: unknown } } | null)?.data;
	if (data?.i18nKey === LIMIT_REACHED && error instanceof Error) {
		throw new CLIError(
			error.message,
			"See them with: superset environments list. Archive one with: superset environments archive <id>",
		);
	}
	throw error;
}
