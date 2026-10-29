import { Trans, useLingui } from "@lingui/react/macro";
import type { CreatePaneInput } from "@superset/panes";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useWorkspaceHostTarget } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { type HotkeyId, useHotkeyDisplay } from "renderer/hotkeys";
import { CloudSection } from "renderer/routes/_authenticated/_dashboard/components/CloudSection";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { EmptyTabActionButton } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/components/EmptyTabActionButton";
import { useDefaultBrowserUrl } from "../../hooks/useDefaultBrowserUrl";
import { useNewTabLists } from "../../hooks/useNewTabLists";
import { useV2TerminalLauncher } from "../../hooks/useV2TerminalLauncher";
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
	const launcher = useV2TerminalLauncher();
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
					<div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2 px-1">
						{options.map((option) => (
							<EmptyTabActionButton
								key={option.kind}
								label={i18n._(option.label)}
								icon={option.Icon}
								display={
									option.hotkeyId ? (hotkeyKeys[option.hotkeyId] ?? []) : []
								}
								className="bg-muted/40 hover:bg-accent/60"
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
