import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { apiClient } from "@/lib/trpc/client";

export const USER_SETTINGS_QUERY_KEY = [
	"cloud",
	"userSettings",
	"get",
] as const;

const userSettingsQuery = {
	queryKey: USER_SETTINGS_QUERY_KEY,
	queryFn: () => apiClient.userSettings.get.query(),
	staleTime: 60_000,
};

export function useAcpChatEnabled(): boolean {
	const { data } = useQuery(userSettingsQuery);
	return data?.experimentalChat === true;
}

/** For choosing chat or terminal at launch: waits for the setting instead of reading "off" while it loads. */
export function useResolveAcpChatEnabled(): () => Promise<boolean> {
	const queryClient = useQueryClient();
	return useCallback(
		() =>
			queryClient
				.ensureQueryData(userSettingsQuery)
				.then((settings) => settings.experimentalChat)
				.catch(() => false),
		[queryClient],
	);
}
