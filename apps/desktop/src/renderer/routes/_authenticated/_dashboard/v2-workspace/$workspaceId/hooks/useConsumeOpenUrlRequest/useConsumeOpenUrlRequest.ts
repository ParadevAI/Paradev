import { useEffect, useRef } from "react";
import type { ConsumeSearch, PaneTarget } from "../../types";
import {
	openUrlInV2Workspace,
	type V2WorkspaceUrlOpenTarget,
} from "../../utils/openUrlInV2Workspace";

interface UseConsumeOpenUrlRequestArgs {
	viewer: PaneTarget;
	url: string | undefined;
	target: V2WorkspaceUrlOpenTarget | undefined;
	requestId: string | undefined;
	agent?: true;
	consumeSearch: ConsumeSearch;
}

export function useConsumeOpenUrlRequest({
	viewer,
	url,
	target,
	requestId,
	agent,
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
		openUrlInV2Workspace({
			store: viewer.store,
			target: resolvedTarget,
			url,
			agent,
		});
		consumeSearch([
			"openUrl",
			"openUrlTarget",
			"openUrlRequestId",
			"openUrlAgent",
		]);
	}, [viewer, target, url, requestId, agent, consumeSearch]);
}

export function getOpenUrlRequestConsumeKey({
	url,
	target,
	requestId,
}: {
	url: string;
	target: V2WorkspaceUrlOpenTarget;
	requestId: string | undefined;
}): string {
	return requestId
		? `${target}:${url}:request:${requestId}`
		: `${target}:${url}`;
}
