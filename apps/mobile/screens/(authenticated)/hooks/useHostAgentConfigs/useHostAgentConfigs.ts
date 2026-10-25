import { isAgentPresetEnabled } from "@superset/shared/host-agent-presets";
import { useQuery } from "@tanstack/react-query";
import { useFeatureFlags } from "posthog-react-native";
import { useCallback } from "react";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";

export function getHostAgentConfigsQueryKey(machineId: string | null) {
	return ["host-agent-configs", machineId] as const;
}

/**
 * The target host's configured agents, fetched live so the list matches what
 * the host can actually run. Edits usually happen on the desktop while this
 * app is backgrounded, so focus refetches unconditionally — returning to the
 * app is the earliest moment the fresh list can matter.
 *
 * A cloud target's hostUrl is "" — unaddressable, same as null.
 */
export function useHostAgentConfigs({
	machineId,
	hostUrl,
	enabled = true,
}: {
	machineId: string | null;
	hostUrl: string | null;
	enabled?: boolean;
}) {
	const featureFlags = useFeatureFlags();
	const select = useCallback(
		<T extends { presetId: string }>(configs: T[]) => {
			const activeFeatureFlags = Object.entries(featureFlags ?? {})
				.filter(([, value]) => Boolean(value))
				.map(([flag]) => flag);
			return configs.filter((config) =>
				isAgentPresetEnabled(config.presetId, activeFeatureFlags),
			);
		},
		[featureFlags],
	);
	return useQuery({
		queryKey: getHostAgentConfigsQueryKey(machineId),
		enabled: enabled && Boolean(hostUrl),
		staleTime: 60_000,
		refetchOnWindowFocus: "always" as const,
		networkMode: "always" as const,
		select,
		queryFn: async () => {
			if (!hostUrl) throw new Error("no host to list agents from");
			return getHostServiceClientByUrl(
				hostUrl,
			).settings.agentConfigs.list.query();
		},
	});
}
