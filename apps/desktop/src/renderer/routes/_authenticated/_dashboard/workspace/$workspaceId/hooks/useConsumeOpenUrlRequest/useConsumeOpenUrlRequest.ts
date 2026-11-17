import { useEffect, useRef } from "react";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import type { ConsumeSearch, PaneTarget } from "../../types";
import {
	openUrlInWorkspace,
	type WorkspaceUrlOpenTarget,
} from "../../utils/openUrlInWorkspace";

interface UseConsumeOpenUrlRequestArgs {
	viewer: PaneTarget;
	url: string | undefined;
	target: WorkspaceUrlOpenTarget | undefined;
	requestId: string | undefined;
	consumeSearch: ConsumeSearch;
}

export function useConsumeOpenUrlRequest({
	viewer,
	url,
	target,
	requestId,
	consumeSearch,
}: UseConsumeOpenUrlRequestArgs): void {
	const consumedRef = useRef<Set<string>>(new Set());

	useEffect(() => {
		if (!url) return;
		const resolvedTarget = target ?? "current-tab";
		const key = getOpenUrlRequestConsumeKey({
			url,
			target: resolvedTarget,
			requestId,
		});
		if (consumedRef.current.has(key)) return;
		consumedRef.current.add(key);
		viewer.reveal();
		const paneId = openUrlInWorkspace({
			store: viewer.store,
			target: resolvedTarget,
			url,
		});
		if (requestId && paneId) {
			electronTrpcClient.browser.resolveOpenRequest
				.mutate({ requestId, paneId })
				.catch((err) => {
					console.error("[useConsumeOpenUrlRequest] resolve open failed:", err);
				});
		}
		consumeSearch(["openUrl", "openUrlTarget", "openUrlRequestId"]);
	}, [viewer, target, url, requestId, consumeSearch]);
}

export function getOpenUrlRequestConsumeKey({
	url,
	target,
	requestId,
}: {
	url: string;
	target: WorkspaceUrlOpenTarget;
	requestId: string | undefined;
}): string {
	return requestId
		? `${target}:${url}:request:${requestId}`
		: `${target}:${url}`;
}
