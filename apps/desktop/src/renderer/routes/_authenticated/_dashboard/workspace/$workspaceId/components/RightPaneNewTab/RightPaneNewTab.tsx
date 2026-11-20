import { Trans, useLingui } from "@lingui/react/macro";
import type { CreatePaneInput } from "@superset/panes";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useWorkspaceHostTarget } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { type HotkeyId, useHotkeyDisplay } from "renderer/hotkeys";
import { CloudSection } from "renderer/routes/_authenticated/_dashboard/components/CloudSection";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/workspace/providers/WorkspaceProvider";
import { EmptyTabActionButton } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/components/EmptyTabActionButton";
import { useDefaultBrowserUrl } from "../../hooks/useDefaultBrowserUrl";
import { useNewTabLists } from "../../hooks/useNewTabLists";
import { useTerminalLauncher } from "../../hooks/useTerminalLauncher";
import type { PaneViewerData } from "../../types";
import { NewTabPagesSection } from "./components/NewTabPagesSection";
import { NewTabPullRequestsSection } from "./components/NewTabPullRequestsSection";
import { createRightPane, getRightPaneOptions } from "./paneOptions";

interface RightPaneNewTabProps {
	onOpen: (pane: CreatePaneInput<PaneViewerData>) => void;
}

export function RightPaneNewTab({ onOpen }: RightPaneNewTabProps) {
	const { i18n } = useLingui();
	const { workspace } = useWorkspace();
	const host = useWorkspaceHostTarget(workspace.id);
	const isMobilePaneEnabled =
		useFeatureFlagEnabled(FEATURE_FLAGS.MOBILE_PANE) === true;
	const launcher = useTerminalLauncher();
	const browserUrl = useDefaultBrowserUrl();
	const { pages, pullRequests } = useNewTabLists(workspace.id);
	const hotkeyKeys: Partial<Record<HotkeyId, string[]>> = {
		NEW_GROUP: useHotkeyDisplay("NEW_GROUP").keys,
		NEW_BROWSER: useHotkeyDisplay("NEW_BROWSER").keys,
		OPEN_DIFF_VIEWER: useHotkeyDisplay("OPEN_DIFF_VIEWER").keys,
	};
	const options = getRightPaneOptions({
		sandbox: host.status === "ready" && host.kind === "sandbox",
		mobilePane: isMobilePaneEnabled,
	});

	return (
		<div className="flex h-full w-full overflow-y-auto">
			<div className="mx-auto w-full max-w-[640px] space-y-4 p-4">
				<CloudSection title={<Trans>Tools</Trans>}>
					<div className="grid grid-cols-[repeat(auto-fill,minmax(min(220px,100%),1fr))] gap-2 px-1">
						{options.map((option) => (
							<EmptyTabActionButton
								key={option.kind}
								label={i18n._(option.label)}
								icon={option.Icon}
								display={
									option.hotkeyId ? (hotkeyKeys[option.hotkeyId] ?? []) : []
								}
								className="h-auto min-h-9 min-w-0 flex-wrap gap-y-1 bg-muted/40 py-1.5 hover:bg-accent/60 [&>span:first-child]:min-w-0 [&>span:first-child]:max-w-full [&>span:first-child>span:last-child]:whitespace-normal [&>span:first-child>span:last-child]:break-words [&>span:last-child]:ml-auto"
								onClick={() =>
									onOpen(
										createRightPane(option.kind, {
											mintTerminalId: launcher.mint,
											browserUrl,
										}),
									)
								}
							/>
						))}
					</div>
				</CloudSection>
				<NewTabPagesSection pages={pages} onOpen={onOpen} />
				<NewTabPullRequestsSection
					pullRequests={pullRequests}
					onOpen={onOpen}
				/>
			</div>
		</div>
	);
}
