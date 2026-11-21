import { useCallback } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

export function useAcpChatEnabled(): boolean {
	const { data } = cloudTrpc.userSettings.get.useQuery();
	return data?.experimentalChat === true;
}

/** False while the setting loads, when `useAcpChatEnabled` still reads "off". */
export function useAcpChatSettled(): boolean {
	return cloudTrpc.userSettings.get.useQuery().isFetched;
}

/** For choosing chat or terminal at launch: waits for the setting instead of reading "off" while it loads. */
export function useResolveAcpChatEnabled(): () => Promise<boolean> {
	// Warm the same preference that the toolbar must honor on the first click.
	cloudTrpc.userSettings.get.useQuery(undefined, { staleTime: 60_000 });
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
