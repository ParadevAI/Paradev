import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { HiMiniCommandLine } from "react-icons/hi2";
import { getPresetIcon } from "renderer/assets/app-icons/preset-icons";
import { useParadevShell } from "renderer/hooks/useParadevShell";
import type { V2TerminalPresetRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { PRESET_ITEM_CLASS, PRESET_ITEM_SHELL_CLASS } from "../../constants";

interface BuiltinPresetBarItemProps {
	preset: V2TerminalPresetRow;
	isDark: boolean;
	onExecutePreset: (preset: V2TerminalPresetRow) => void;
	onHide: (presetId: string) => void;
}

// Built-in presets have no v2TerminalPresets row, so unlike V2PresetBarItem
// they are not draggable (nothing to persist), not editable, and "Remove"
// persists to user preferences instead of the row's pinnedToBar.
export function BuiltinPresetBarItem({
	preset,
	isDark,
	onExecutePreset,
	onHide,
}: BuiltinPresetBarItemProps) {
	const isParadevShell = useParadevShell();
	const icon = getPresetIcon("superset", isDark);

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<div>
					<Tooltip delayDuration={700}>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								className={
									isParadevShell ? PRESET_ITEM_SHELL_CLASS : PRESET_ITEM_CLASS
								}
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
								<span className="min-w-0 truncate">{preset.name}</span>
							</Button>
						</TooltipTrigger>
						{preset.description ? (
							<TooltipContent side="bottom" className="max-w-64">
								{preset.description}
							</TooltipContent>
						) : null}
					</Tooltip>
				</div>
			</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem onSelect={() => onExecutePreset(preset)}>
					<Trans>Run script</Trans>
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem onSelect={() => onHide(preset.id)}>
					<Trans>Remove script</Trans>
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
