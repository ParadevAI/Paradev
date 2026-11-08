import { acpHarnessForPreset } from "@superset/chat/core";
import type { HostAgentConfig } from "@superset/host-service/settings";
import { resolveChatLaunchPresetId } from "@superset/shared/agent-models";

export function chatPresetIdForConfig(
	config: Pick<HostAgentConfig, "presetId" | "command">,
): string | null {
	const presetId = resolveChatLaunchPresetId(config.presetId, config.command);
	return acpHarnessForPreset(presetId) ? presetId : null;
}
