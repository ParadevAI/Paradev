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
import { Loader2 } from "lucide-react";
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
import { usePresetStarting } from "../../../../state/presetLaunches";

const V2_PRESET_BAR_ITEM_TYPE = "V2_PRESET_BAR_ITEM";

interface PresetBarItemProps {
	workspaceId: string;
	hostUrl: string;
	onViewUsage: () => void;
	preset: TerminalPresetRow;
	visibleIndex: number;
	hotkeyId?: HotkeyId;
	isDark: boolean;
	agents: HostAgentConfig[] | undefined;
	onExecutePreset: (preset: TerminalPresetRow) => void;
	onEdit: (preset: TerminalPresetRow) => void;
	onLocalReorder: (fromIndex: number, toIndex: number) => void;
	onPersistReorder: (presetId: string, targetVisibleIndex: number) => void;
}

export function PresetBarItem({
	workspaceId,
	hostUrl,
	onViewUsage,
	preset,
	visibleIndex,
	hotkeyId,
	isDark,
	agents,
	onExecutePreset,
	onEdit,
	onLocalReorder,
	onPersistReorder,
}: PresetBarItemProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const icon = resolvePresetIcon(preset, agents, isDark);
	const starting = usePresetStarting(workspaceId, preset.id);
	const linked = findLinkedAgent(agents, preset.agentId);
	const isCodex =
		(linked?.presetId ?? resolvePresetIconKey(preset, undefined)) === "codex";
	const quota = useHostUsageQuota(isCodex ? hostUrl : null);
	const account = quota.data?.find(
		(item) => item.agent === "codex" && item.isDefault,
	);
	const now = useNow(60_000, isCodex);
	const windows =
		account?.status === "ok" &&
		!quota.isError &&
		now.getTime() - new Date(account.fetchedAt).getTime() < 10 * 60_000
			? account.windows.filter(
					(window) =>
						Number.isFinite(window.usedPercent) &&
						window.usedPercent >= 0 &&
						(!window.resetsAt ||
							new Date(window.resetsAt).getTime() > now.getTime()),
				)
			: [];
	const summary =
		windows.find(
			(window) =>
				["seven_day", "secondary"].includes(window.id) ||
				window.label === "Weekly",
		) ?? windows[0];

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
							aria-busy={starting}
							disabled={starting}
							className="h-6 max-w-48 min-w-0 shrink-0 gap-2 rounded-md px-2 text-xs font-normal text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
							onClick={() => onExecutePreset(preset)}
						>
							{starting ? (
								<Loader2
									aria-hidden
									className="size-3.5 shrink-0 animate-spin"
								/>
							) : icon ? (
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
							{isCodex && (
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
			<ContextMenuContent>
				{isCodex && (
					<>
						<ContextMenuLabel>
							<Trans>Usage</Trans> · <Trans>Default</Trans>
						</ContextMenuLabel>
						{windows.length ? (
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
						<ContextMenuItem onSelect={onViewUsage}>
							<Trans>View usage</Trans>
						</ContextMenuItem>
						<ContextMenuSeparator />
					</>
				)}
				<ContextMenuItem
					disabled={starting}
					onSelect={() => onExecutePreset(preset)}
				>
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
