import { useLingui } from "@lingui/react/macro";
import type { PaneActionConfig } from "@superset/panes";
import { useMemo } from "react";
import { HiMiniXMark } from "react-icons/hi2";
import { TbLayoutColumns, TbLayoutRows } from "react-icons/tb";
import { HotkeyLabel } from "renderer/hotkeys";
import type { PaneViewerData } from "../../types";
import { newSplitPane } from "../../utils/newSplitPane";
import type { TerminalLauncher } from "../useV2TerminalLauncher";

export function useDefaultPaneActions({
	launcher,
}: {
	launcher: TerminalLauncher;
}): PaneActionConfig<PaneViewerData>[] {
	const { t } = useLingui();
	return useMemo<PaneActionConfig<PaneViewerData>[]>(
		() => [
			{
				key: "split",
				icon: (ctx) =>
					ctx.pane.parentDirection === "horizontal" ? (
						<TbLayoutRows className="size-3.5" />
					) : (
						<TbLayoutColumns className="size-3.5" />
					),
				tooltip: (
					<HotkeyLabel
						label={t({
							message: "Split pane",
						})}
						id="SPLIT_AUTO"
					/>
				),
				onClick: (ctx) => {
					const position =
						ctx.pane.parentDirection === "horizontal" ? "down" : "right";
					ctx.actions.split(position, newSplitPane(ctx.pane, launcher.mint));
				},
			},
			{
				key: "close",
				icon: <HiMiniXMark className="size-3.5" />,
				onClick: (ctx) => ctx.actions.close(),
			},
		],
		[launcher, t],
	);
}
