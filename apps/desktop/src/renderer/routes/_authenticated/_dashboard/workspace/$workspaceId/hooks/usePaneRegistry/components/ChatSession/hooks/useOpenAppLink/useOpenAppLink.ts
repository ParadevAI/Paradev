import { type UseNavigateResult, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { env } from "renderer/env.renderer";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import {
	parseSupersetAppLink,
	type SupersetAppLink,
} from "../../utils/supersetAppLink";

function openInApp(
	link: Exclude<SupersetAppLink, { kind: "page" }>,
	navigate: UseNavigateResult<string>,
): void {
	switch (link.kind) {
		case "task":
			void navigate({ to: "/tasks/$taskId", params: { taskId: link.taskId } });
			return;
		case "automation":
			void navigate({
				to: "/automations/$automationId",
				params: { automationId: link.automationId },
			});
			return;
		case "plugin":
			void navigate({
				to: "/plugins/$pluginName",
				params: { pluginName: link.pluginName },
			});
			return;
		case "environment":
			void navigate({
				to: "/settings/environments/$environmentId",
				params: { environmentId: link.environmentId },
			});
			return;
		case "workspace":
			void navigate({
				to: "/workspace/$workspaceId",
				params: { workspaceId: link.workspaceId },
			});
			return;
		case "chat":
			void navigateToWorkspace(link.workspaceId, navigate, {
				search: {
					sessionId: link.sessionId,
					focusRequestId: crypto.randomUUID(),
				},
			});
	}
}

/**
 * Opens a link to a task, workspace, chat or other app screen inside the app.
 * False for any other link and for a page.
 */
export function useOpenAppLink(): (href: string) => boolean {
	const navigate = useNavigate();
	return useCallback(
		(href) => {
			const link = parseSupersetAppLink(href, env.NEXT_PUBLIC_WEB_URL);
			if (!link || link.kind === "page") return false;
			openInApp(link, navigate);
			return true;
		},
		[navigate],
	);
}
