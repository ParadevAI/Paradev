import { msg } from "@lingui/core/macro";
import { serializePluginChange } from "@superset/agent-setup";
import { i18n } from "@superset/i18n";
import log from "electron-log/main";

const PLUGIN_CHANGE_TIMEOUT_MS = 60_000;

/**
 * Runs a plugin change after the ones before it. The caller stops waiting at
 * the timeout, counted from this call, but the next change still waits for
 * this one to end, so two never write the ledger at once.
 */
export function runPluginChange<T>(
	change: () => Promise<T>,
	timeoutMs = PLUGIN_CHANGE_TIMEOUT_MS,
): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
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
		serializePluginChange(change)
			.then(resolve, (error) => {
				if (timedOut) {
					log.warn("[plugins] change failed after its timeout:", error);
				}
				reject(error);
			})
			.finally(() => clearTimeout(timer));
	});
}
