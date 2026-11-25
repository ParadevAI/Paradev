import { useLingui } from "@lingui/react/macro";
import type { RendererContext } from "@superset/panes";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback, useRef } from "react";
import {
	tierFor,
	useInlineFilePolicy,
	useTerminalFolderPolicy,
	useUrlLinkAction,
} from "renderer/lib/clickPolicy";
import { useOpenInExternalEditor } from "renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/hooks/useOpenInExternalEditor";
import { useWorkspacePathHost } from "renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/hooks/usePaneRegistry/hooks/useWorkspacePathHost";
import { useRevealInFinder } from "renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/hooks/useRevealInFinder";
import { useRightPaneLinkTarget } from "renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/providers/RightPaneLinkTargetProvider";
import type {
	OpenFile,
	PaneViewerData,
} from "renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/types";
import {
	runChatPullRequestLink,
	runFileLinkAction,
	runFolderLinkAction,
	runUrlLinkAction,
	type TerminalLinkActionDeps,
} from "../../../../utils/runTerminalLinkAction";
import type { OpenLink } from "../../../ChatSession/providers/ChatPaneActionsProvider";
import { locateChatLink } from "./utils/locateChatLink";
import { parseFileHref } from "./utils/parseFileHref";

const WEB_URL = /^https?:\/\//i;

export function useOpenChatLink({
	store,
	workspaceId,
	onOpenFile,
	onRevealPath,
	showHint,
}: {
	store: RendererContext<PaneViewerData>["store"];
	workspaceId: string;
	onOpenFile: OpenFile;
	onRevealPath: (path: string, options?: { isDirectory?: boolean }) => void;
	showHint: (clientX: number, clientY: number) => void;
}): OpenLink {
	const { t } = useLingui();
	const filePolicy = useInlineFilePolicy();
	const folderPolicy = useTerminalFolderPolicy("2-tier");
	const getUrlAction = useUrlLinkAction("2-tier");
	const openInExternalEditor = useOpenInExternalEditor(workspaceId);
	const revealInFinder = useRevealInFinder(workspaceId);
	const rightPane = useRightPaneLinkTarget();
	const { data: workspace } = workspaceTrpc.workspace.get.useQuery({
		id: workspaceId,
	});
	const pathHost = useWorkspacePathHost(workspaceId);

	const depsRef = useRef<TerminalLinkActionDeps>({
		store,
		onOpenFile,
		onRevealPath,
		openInExternalEditor,
		revealInFinder,
		worktreePath: undefined,
		rightPane,
	});
	depsRef.current = {
		store,
		onOpenFile,
		onRevealPath,
		openInExternalEditor,
		revealInFinder,
		worktreePath: workspace?.worktreePath ?? undefined,
		rightPane,
	};

	return useCallback(
		(href, event, chosen) => {
			const isPlain = tierFor(event, "2-tier") === "plain";
			const openWebUrl = (url: string) => {
				if (runChatPullRequestLink(depsRef.current, url, event, chosen)) return;
				const action =
					chosen ?? getUrlAction(event, url) ?? (isPlain ? "pane" : null);
				if (action === null) showHint(event.clientX, event.clientY);
				else runUrlLinkAction(depsRef.current, url, action);
			};
			if (WEB_URL.test(href)) {
				openWebUrl(href);
				return true;
			}

			const file = parseFileHref(href);
			if (!file) return false;
			void locateChatLink(href, file.path, pathHost).then(
				(stat) => {
					if (!stat) {
						const { path } = file;
						toast.error(t({ message: `Path not found: ${path}` }));
						return;
					}
					if (stat.kind === "web") {
						openWebUrl(stat.url);
						return;
					}
					if (stat.isDirectory) {
						const intent = chosen
							? chosen === "external"
								? "external"
								: "reveal"
							: folderPolicy.getIntent(event);
						if (intent === null) showHint(event.clientX, event.clientY);
						else
							runFolderLinkAction(depsRef.current, stat.resolvedPath, intent);
						return;
					}
					const action = chosen ?? filePolicy.getAction(event);
					if (action === null) {
						showHint(event.clientX, event.clientY);
						return;
					}
					runFileLinkAction(
						depsRef.current,
						{ path: stat.resolvedPath, row: file.row, col: file.col },
						action,
					);
				},
				(error) => {
					console.error("Failed to stat chat link path:", file.path, error);
					toast.error(t({ message: "Could not reach the workspace host" }));
				},
			);
			return true;
		},
		[getUrlAction, filePolicy, folderPolicy, pathHost, showHint, t],
	);
}
