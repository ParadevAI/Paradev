import { msg } from "@lingui/core/macro";
import { serializePluginChange } from "@superset/agent-setup";
import { i18n } from "@superset/i18n";

const PLUGIN_CHANGE_TIMEOUT_MS = 60_000;

/**
 * Runs a plugin change after the ones before it. The caller stops waiting at
 * the timeout, but the next change still waits for this one to end, so two
 * never write the ledger at once.
 */
export function runPluginChange<T>(
	change: () => Promise<T>,
	timeoutMs = PLUGIN_CHANGE_TIMEOUT_MS,
): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		serializePluginChange(() => {
			timer = setTimeout(() => {
				const seconds = Math.round(timeoutMs / 1000);
				reject(
					new Error(
						i18n._(
							msg({
								message: `The plugin change did not finish in ${seconds} seconds.`,
							}),
						),
					),
				);
			}, timeoutMs);
			return change();
		})
			.then(resolve, reject)
			.finally(() => clearTimeout(timer));
	});
}
