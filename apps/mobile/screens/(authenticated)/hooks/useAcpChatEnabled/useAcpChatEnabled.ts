import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/trpc/client";

export const USER_SETTINGS_QUERY_KEY = [
	"cloud",
	"userSettings",
	"get",
] as const;

export function useAcpChatEnabled(): boolean {
	const { data } = useQuery({
		queryKey: USER_SETTINGS_QUERY_KEY,
		queryFn: () => apiClient.userSettings.get.query(),
		staleTime: 60_000,
	});
	return data?.experimentalChat === true;
}
