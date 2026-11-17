import type { Tab, WorkspaceStore } from "@superset/panes";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback, useEffect, useRef } from "react";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData } from "../../types";
import {
	shouldClearSessionName,
	soleTerminalId,
	tabNamesToBackfill,
} from "./utils/tabSessionNames";

// Per app run: a session seen once is not backfilled again until relaunch.
const backfilledTerminalIds = new Set<string>();

interface UseTabSessionNamesArgs {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	workspaceId: string;
	isLayoutReady: boolean;
}

export function useTabSessionNames({
	store,
	workspaceId,
	isLayoutReady,
}: UseTabSessionNamesArgs) {
	const utils = workspaceTrpc.useUtils();
	const { mutateAsync: renameSession } =
		workspaceTrpc.terminal.rename.useMutation();
	const pending = useRef<Promise<unknown>>(Promise.resolve());

	const enqueue = useCallback(
		(work: () => Promise<unknown>) => {
			pending.current = pending.current
				.then(work)
				.catch((error) =>
					console.warn("[useTabSessionNames] rename failed", { error }),
				)
				.finally(() => utils.terminal.list.invalidate({ workspaceId }));
			return pending.current;
		},
		[utils, workspaceId],
	);

	const freshSessions = useCallback(
		async () =>
			(await utils.terminal.list.fetch({ workspaceId }, { staleTime: 0 }))
				.sessions,
		[utils, workspaceId],
	);

	useEffect(() => {
		if (!isLayoutReady) return;
		let cancelled = false;
		void enqueue(async () => {
			const sessions = await freshSessions();
			if (cancelled) return;
			const initial = tabNamesToBackfill(
				store.getState().tabs,
				sessions,
				backfilledTerminalIds,
			);
			for (const session of sessions) {
				backfilledTerminalIds.add(session.terminalId);
			}
			for (const { terminalId } of initial) {
				if (cancelled) return;
				try {
					const current = tabNamesToBackfill(
						store.getState().tabs,
						await freshSessions(),
						new Set(),
					).find((n) => n.terminalId === terminalId);
					if (!current) continue;
					await renameSession({
						workspaceId,
						terminalId,
						title: current.title,
					});
				} catch (error) {
					console.warn("[useTabSessionNames] backfill failed", {
						terminalId,
						error,
					});
				}
			}
		});
		return () => {
			cancelled = true;
		};
	}, [
		isLayoutReady,
		workspaceId,
		store,
		enqueue,
		freshSessions,
		renameSession,
	]);

	return useCallback(
		(tab: Tab<PaneViewerData>, title: string | undefined) => {
			const terminalId = soleTerminalId(tab);
			if (!terminalId) return;
			backfilledTerminalIds.add(terminalId);
			void enqueue(async () => {
				if (!title) {
					const session = (await freshSessions()).find(
						(s) => s.terminalId === terminalId,
					);
					if (
						!shouldClearSessionName(tab.titleOverride, session?.customTitle)
					) {
						return;
					}
				}
				await renameSession({ workspaceId, terminalId, title: title ?? "" });
			});
		},
		[enqueue, freshSessions, renameSession, workspaceId],
	);
}
