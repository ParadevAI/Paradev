import { Trans } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { TerminalSquare } from "lucide-react";
import { useMemo } from "react";
import { usePresetIcon } from "renderer/assets/app-icons/preset-icons";
import { useParadevShell } from "renderer/hooks/useParadevShell";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import { PageHeader } from "renderer/routes/_authenticated/_dashboard/components/PageHeader";
import { useTitleBarMainSlot } from "renderer/routes/_authenticated/_dashboard/providers/TitleBarSlotsProvider";
import { ConnectionNotice } from "../../$workspaceId/hooks/usePaneRegistry/components/ChatSession/components/ConnectionNotice";
import { LaunchPromptView } from "../../$workspaceId/hooks/usePaneRegistry/components/ChatSession/components/LaunchPromptView";
import {
	CHAT_COLUMN_CLASSNAME,
	CHAT_GUTTER_CLASSNAME,
} from "../../$workspaceId/hooks/usePaneRegistry/components/ChatSession/constants";

export function PendingCloudChatPreview({
	agentId,
	label,
	prompt,
	stage,
}: {
	agentId: string;
	label: string;
	prompt?: string;
	stage: "workspace" | "agent";
}) {
	const isCards = useParadevShell();
	const tabBarInTitleBar = useTitleBarMainSlot() !== undefined;
	const { showPresetsBar } = useV2UserPreferences().preferences;
	const iconSrc = usePresetIcon(agentId);
	const launched = useMemo(
		() => (prompt ? [{ type: "text" as const, text: prompt }] : undefined),
		[prompt],
	);

	return (
		<div className="flex h-full w-full flex-col overflow-hidden bg-background">
			{!tabBarInTitleBar && <PageHeader />}
			{showPresetsBar && <div className="h-10 shrink-0" />}
			<div className={cn("flex min-h-0 flex-1", isCards && "p-1.5")}>
				<div
					className={cn(
						"flex min-h-0 w-full flex-col overflow-hidden",
						isCards
							? "rounded-[10px] border border-border bg-background"
							: "border-2 border-transparent",
					)}
				>
					<div
						className={cn(
							"flex shrink-0 items-center",
							isCards ? "h-8" : "h-7 border-b border-border/20 bg-muted/30",
						)}
					>
						<div className="flex h-full w-full min-w-0 items-center gap-2 px-3">
							<div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden font-medium">
								<span className="shrink-0 text-muted-foreground">
									{iconSrc ? (
										<img
											alt=""
											className="size-3.5 shrink-0"
											draggable={false}
											src={iconSrc}
										/>
									) : (
										<TerminalSquare className="size-3.5 shrink-0" />
									)}
								</span>
								<span className="truncate text-foreground text-xs">
									{label}
								</span>
							</div>
						</div>
					</div>
					{launched ? (
						<LaunchPromptView prompt={launched} />
					) : (
						<div className="min-h-0 flex-1" />
					)}
					<ConnectionNotice>
						{stage === "workspace" ? (
							<Trans>Starting cloud workspace…</Trans>
						) : (
							<Trans>Starting the agent…</Trans>
						)}
					</ConnectionNotice>
					<div className={cn(CHAT_GUTTER_CLASSNAME, "pt-1 pb-5")}>
						<div
							aria-hidden="true"
							className={cn(
								CHAT_COLUMN_CLASSNAME,
								"h-[106px] rounded-2xl bg-card ring-1 ring-border",
							)}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}
