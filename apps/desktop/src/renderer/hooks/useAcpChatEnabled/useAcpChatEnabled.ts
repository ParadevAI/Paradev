import { useCallback } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

export function useAcpChatEnabled(): boolean {
	const { data } = cloudTrpc.userSettings.get.useQuery();
	return data?.experimentalChat === true;
}

/** For choosing chat or terminal at launch: waits for the setting instead of reading "off" while it loads. */
export function useResolveAcpChatEnabled(): () => Promise<boolean> {
	const utils = cloudTrpc.useUtils();
	return useCallback(
		() =>
			utils.userSettings.get
				.ensureData()
				.then((settings) => settings.experimentalChat)
				.catch(() => false),
		[utils],
	);
}
