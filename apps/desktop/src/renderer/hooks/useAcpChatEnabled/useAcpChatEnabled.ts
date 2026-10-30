import { cloudTrpc } from "renderer/lib/cloud-trpc";

export function useAcpChatEnabled(): boolean {
	const { data } = cloudTrpc.userSettings.get.useQuery();
	return data?.experimentalChat === true;
}
