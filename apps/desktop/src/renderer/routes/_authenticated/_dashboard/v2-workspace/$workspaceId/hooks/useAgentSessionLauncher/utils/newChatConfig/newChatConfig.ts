import type { HostAgentConfig } from "@superset/host-service/settings";
import { chatPresetIdForConfig } from "../../../../utils/chatPresetIdForConfig";

type Config = Pick<HostAgentConfig, "id" | "presetId" | "command">;

/**
 * The config a new chat opens with: the last chat's, then Claude, then any
 * that can chat. `last` is a config id, or a preset id saved by older builds.
 */
export function newChatConfig<T extends Config>(
	configs: readonly T[],
	last: string | undefined,
): T | undefined {
	const chatConfigs = configs.filter((config) => chatPresetIdForConfig(config));
	return (
		chatConfigs.find((config) => config.id === last) ??
		chatConfigs.find((config) => chatPresetIdForConfig(config) === last) ??
		chatConfigs.find((config) => chatPresetIdForConfig(config) === "claude") ??
		chatConfigs[0]
	);
}
