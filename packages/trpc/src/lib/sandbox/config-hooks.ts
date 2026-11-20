/**
 * What the control plane needs from an environment's `config.toml` (the
 * `environments.config` text, never a repository's own file). Ports must be
 * known before the box exists, since a sandbox publishes its ports at create;
 * `[install]` runs only in an environment build. The box gets the whole text
 * as a file and reads its own setup and terminals from it.
 */
import {
	MAX_PREVIEW_PORTS,
	parseProjectConfig,
	type ResolvedPhase,
	resolveProjectConfig,
} from "@superset/shared/project-config";

export interface ConfigHooks {
	ports?: number[];
	install?: ResolvedPhase;
}

/** The ports with `preview = true` and the install phase, as the cloud resolves them. Null when the config is unset or invalid. */
export function configHooks(text: string | null): ConfigHooks | null {
	if (!text?.trim()) return null;
	const parsed = parseProjectConfig(text);
	if (!parsed.ok) return null;
	const resolved = resolveProjectConfig({
		base: parsed.config,
		local: null,
		environment: "cloud",
	});
	const ports = resolved.ports
		.filter((port) => port.preview)
		.map((port) => port.default)
		.slice(0, MAX_PREVIEW_PORTS);
	return {
		...(ports.length > 0 ? { ports } : {}),
		...(resolved.install.commands.length > 0
			? { install: resolved.install }
			: {}),
	};
}
