import { claudeTeleportProvider } from "./claude/claude";
import type { TeleportProvider } from "./types";

const PROVIDERS: readonly TeleportProvider[] = [claudeTeleportProvider];

/** The provider that can move this harness's sessions, or null when none can. */
export function teleportProviderFor(harness: string): TeleportProvider | null {
	return (
		PROVIDERS.find((provider) => provider.harnesses.includes(harness)) ?? null
	);
}

/** The provider that can move this terminal agent's sessions, or null when none can. */
export function teleportProviderForAgent(
	agentId: string,
): TeleportProvider | null {
	return (
		PROVIDERS.find((provider) => provider.terminalAgents.includes(agentId)) ??
		null
	);
}

export {
	type BundleManifest,
	isPlainSessionId,
	parseBundleManifest,
	type TeleportProvider,
} from "./types";
