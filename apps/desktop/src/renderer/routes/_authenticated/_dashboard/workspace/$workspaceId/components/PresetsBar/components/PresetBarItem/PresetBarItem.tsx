import { Trans } from "@lingui/react/macro";
import type { HostAgentConfig } from "@superset/host-service/settings";
import { formatPercent } from "@superset/i18n/format";
import { Button } from "@superset/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuLabel,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { cn } from "@superset/ui/utils";
import { useEffect, useRef } from "react";
import { useDrag, useDrop } from "react-dnd";
import { HiMiniCommandLine } from "react-icons/hi2";
import { QuotaWindowRow } from "renderer/components/QuotaWindowRow";
import { useHostUsageQuota } from "renderer/hooks/host-service/useHostUsageQuota";
import { useNow } from "renderer/hooks/useNow";
import type { HotkeyId } from "renderer/hotkeys";
import { HotkeyTooltip } from "renderer/hotkeys";
import { findLinkedAgent } from "renderer/lib/agent-launch-command";
import { resolvePresetIcon } from "renderer/lib/preset-icon";
import { resolvePresetIconKey } from "renderer/lib/preset-icon-key";
import type { TerminalPresetRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { useSettings } from "renderer/stores/settings";
import { getCodexPresetQuota } from "./utils/getCodexPresetQuota";

const V2_PRESET_BAR_ITEM_TYPE = "V2_PRESET_BAR_ITEM";

interface PresetBarItemProps {
	preset: TerminalPresetRow;
	hostUrl: string | null;
	visibleIndex: number;
	hotkeyId?: HotkeyId;
	isDark: boolean;
	agents: HostAgentConfig[] | undefined;
	onExecutePreset: (preset: TerminalPresetRow) => void;
	onEdit: (preset: TerminalPresetRow) => void;
	onViewUsage: (accountKey?: string) => void;
	onLocalReorder: (fromIndex: number, toIndex: number) => void;
	onPersistReorder: (presetId: string, targetVisibleIndex: number) => void;
}

export function PresetBarItem({
	preset,
	hostUrl,
	visibleIndex,
	hotkeyId,
	isDark,
	agents,
	onExecutePreset,
	onEdit,
	onViewUsage,
	onLocalReorder,
	onPersistReorder,
}: PresetBarItemProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const icon = resolvePresetIcon(preset, agents, isDark);
	const location = useSettings((settings) => settings.codexUsageLocation);
	const linked = findLinkedAgent(agents, preset.agentId);
	const isCodex =
		(linked?.presetId ?? resolvePresetIconKey(preset, undefined)) === "codex";
	const showUsage = isCodex && location === "preset";
	const quota = useHostUsageQuota(showUsage ? hostUrl : null);
	const now = useNow(60_000, showUsage && !!hostUrl);
	const { account, windows, summary } = getCodexPresetQuota(
		quota.data ?? [],
		now.getTime(),
		quota.isError,
	);
	const used = summary
		? formatPercent(summary.usedPercent / 100, { maximumFractionDigits: 0 })
		: undefined;

	const [{ isDragging }, drag] = useDrag(
		() => ({
			type: V2_PRESET_BAR_ITEM_TYPE,
			item: {
				id: preset.id,
				index: visibleIndex,
				originalIndex: visibleIndex,
			},
			collect: (monitor) => ({
				isDragging: monitor.isDragging(),
			}),
		}),
		[preset.id, visibleIndex],
	);

	const [, drop] = useDrop({
		accept: V2_PRESET_BAR_ITEM_TYPE,
		hover: (item: { id: string; index: number; originalIndex: number }) => {
			if (item.index !== visibleIndex) {
				onLocalReorder(item.index, visibleIndex);
				item.index = visibleIndex;
			}
		},
		drop: (item: { id: string; index: number; originalIndex: number }) => {
			if (item.originalIndex !== item.index) {
				onPersistReorder(item.id, item.index);
			}
		},
	});

	useEffect(() => {
		drag(drop(containerRef));
	}, [drag, drop]);

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<div
					ref={containerRef}
					className={isDragging ? "opacity-40" : undefined}
					style={{ cursor: isDragging ? "grabbing" : "grab" }}
				>
					<HotkeyTooltip id={hotkeyId}>
						<Button
							variant="ghost"
							size="sm"
							className={cn(
								"h-6 min-w-0 shrink-0 gap-2 rounded-md px-2 text-xs font-normal text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground",
								showUsage ? "max-w-56" : "max-w-32",
							)}
							onClick={() => onExecutePreset(preset)}
						>
							{icon ? (
								<img
									src={icon}
									alt=""
									className="size-3.5 shrink-0 object-contain opacity-90"
								/>
							) : (
								<HiMiniCommandLine className="size-3.5 shrink-0" />
							)}
							<span className="min-w-0 truncate">
								{preset.name || "default"}
							</span>
							{showUsage && (
								<span className="shrink-0 text-[10px] tabular-nums">
									{summary && used ? (
										<>
											{summary.label} · <Trans>{used} used</Trans>
										</>
									) : (
										<Trans>Usage</Trans>
									)}
								</span>
							)}
						</Button>
					</HotkeyTooltip>
				</div>
			</ContextMenuTrigger>
			<ContextMenuContent className={showUsage ? "w-96" : undefined}>
				{showUsage && (
					<>
						<ContextMenuLabel>
							<Trans>Usage</Trans> · <Trans>Default</Trans>
						</ContextMenuLabel>
						{windows.length > 0 ? (
							windows.map((window) => (
								<QuotaWindowRow
									key={window.id}
									window={window}
									className="px-2"
								/>
							))
						) : (
							<output className="block px-2 text-xs text-muted-foreground">
								{account?.credentialKind === "api_key" ? (
									<Trans>API billing</Trans>
								) : quota.isLoading ? (
									<Trans>Reading usage…</Trans>
								) : (
									<Trans>Usage unavailable.</Trans>
								)}
							</output>
						)}
						<ContextMenuItem onSelect={() => onViewUsage(account?.accountKey)}>
							<Trans>View usage</Trans>
						</ContextMenuItem>
						<ContextMenuSeparator />
					</>
				)}
				<ContextMenuItem onSelect={() => onExecutePreset(preset)}>
					<Trans>Run script</Trans>
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem onSelect={() => onEdit(preset)}>
					<Trans>Edit script</Trans>
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
