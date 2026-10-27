import { useLingui } from "@lingui/react/macro";
import type { CreatePaneInput } from "@superset/panes";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useWorkspaceHostTarget } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { useDefaultBrowserUrl } from "../../hooks/useDefaultBrowserUrl";
import { useV2TerminalLauncher } from "../../hooks/useV2TerminalLauncher";
import type { PaneViewerData } from "../../types";
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
	const options = getRightPaneOptions({
		sandbox: host.status === "ready" && host.kind === "sandbox",
		mobilePane: isMobilePaneEnabled,
	});

	return (
		<div className="flex h-full w-full overflow-y-auto">
			<div className="m-auto grid w-full max-w-lg grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2 p-6">
				{options.map((option) => (
					<button
						key={option.kind}
						type="button"
						className="flex h-24 flex-col items-center justify-center gap-2.5 rounded-lg border border-border/60 bg-muted/30 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						onClick={() =>
							onOpen(
								createRightPane(option.kind, {
									mintTerminalId: launcher.mint,
									browserUrl,
								}),
							)
						}
					>
						<option.Icon className="size-6" strokeWidth={1.5} />
						<span>{i18n._(option.label)}</span>
					</button>
				))}
			</div>
		</div>
	);
}
