import { useLingui } from "@lingui/react/macro";
import type { SessionSnapshot } from "@superset/chat/core";
import { subagentItem } from "@superset/chat/core";
import { useCallback, useEffect, useMemo } from "react";
import {
	type SubagentCrumb,
	useChatSubagentStore,
} from "../../../../../../stores/chatSubagentStore";
import { subagentPath } from "./utils/subagentPath";

const NO_PATH: readonly SubagentCrumb[] = [];

export function useSubagentNavigation({
	chatKey,
	items,
}: {
	chatKey: string;
	items: SessionSnapshot["items"];
}): {
	focusedId: string | null;
	openSubagent: (itemId: string) => void;
	goBack: () => void;
} {
	const { t } = useLingui();
	const openedId = useChatSubagentStore(
		(state) => state.opened[chatKey] ?? null,
	);
	const open = useChatSubagentStore((state) => state.open);
	const setPath = useChatSubagentStore((state) => state.setPath);
	const focusedId = subagentItem(items, openedId)?.id ?? null;
	const loaded = items.size > 0;

	useEffect(() => {
		if (openedId && !focusedId && loaded) open(chatKey, null);
	}, [chatKey, openedId, focusedId, loaded, open]);

	const fallbackTitle = t({ message: "Subagent" });
	const path = useMemo(
		() => (focusedId ? subagentPath(items, focusedId, fallbackTitle) : NO_PATH),
		[items, focusedId, fallbackTitle],
	);
	useEffect(() => setPath(chatKey, path), [chatKey, path, setPath]);
	useEffect(() => () => setPath(chatKey, NO_PATH), [chatKey, setPath]);

	const openSubagent = useCallback(
		(itemId: string) => open(chatKey, itemId),
		[chatKey, open],
	);
	const goBack = useCallback(
		() => open(chatKey, path.at(-2)?.id ?? null),
		[chatKey, open, path],
	);
	return { focusedId, openSubagent, goBack };
}
