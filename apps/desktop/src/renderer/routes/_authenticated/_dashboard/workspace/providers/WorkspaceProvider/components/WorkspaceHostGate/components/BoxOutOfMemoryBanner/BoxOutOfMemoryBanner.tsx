import { useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { machineSpec } from "@superset/shared/billing";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { useRunAfterMenuClose } from "@superset/ui/hooks/use-run-after-menu-close";
import { LuTriangleAlert, LuX } from "react-icons/lu";
import { MachineSizeMenuItems } from "renderer/routes/_authenticated/_dashboard/components/MachineSizeMenuItems";
import { useChangeMachineSize } from "renderer/routes/_authenticated/hooks/useChangeMachineSize";
import {
	boxPressureEpisode,
	useBoxPressure,
	useBoxPressureStore,
} from "renderer/stores/box-pressure";
import { nextMachineSize } from "./utils/nextMachineSize";

const MB_PER_GB = 1024;

export function BoxOutOfMemoryBanner({ workspaceId }: { workspaceId: string }) {
	const { t } = useLingui();
	const { runAfterClose, onCloseAutoFocus } = useRunAfterMenuClose();
	const { formatNumber } = useFormat();
	const pressure = useBoxPressure(workspaceId);
	const dismissedEpisode = useBoxPressureStore(
		(state) => state.dismissed[workspaceId],
	);
	const dismiss = useBoxPressureStore((state) => state.dismiss);
	const { options, currentSize, currentOption, isResizing } =
		useChangeMachineSize(workspaceId);

	if (pressure?.level !== "critical") return null;
	const episode = boxPressureEpisode(pressure);
	if (dismissedEpisode === episode) return null;

	const reap = pressure.reap;
	const suggested = nextMachineSize(
		options.map((option) => option.size),
		currentSize,
	);
	const suggestedName = options.find(
		(option) => option.size === suggested,
	)?.name;
	const memoryGb = formatNumber(machineSpec(currentSize).memoryGb);
	const sizeName = currentOption?.name ?? currentSize;

	return (
		<div
			role="alert"
			className="flex shrink-0 items-center gap-3 border-t border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-foreground/85"
		>
			<LuTriangleAlert
				className="size-4 shrink-0 text-destructive"
				aria-hidden="true"
			/>
			<span className="min-w-0 flex-1 select-text">
				{reap
					? t({
							message: `Out of memory: the box stopped ${reap.processName} (${formatNumber(reap.rssMb / MB_PER_GB, { maximumFractionDigits: 1 })} GB) to keep running. ${sizeName} has ${memoryGb} GB.`,
						})
					: t({
							message: `Out of memory: the box is close to not responding. ${sizeName} has ${memoryGb} GB.`,
						})}
			</span>
			{suggested !== currentSize && suggestedName ? (
				<DropdownMenu>
					<DropdownMenuTrigger
						disabled={isResizing}
						className="shrink-0 rounded px-1.5 py-0.5 font-medium text-foreground hover:bg-destructive/20 disabled:opacity-60"
					>
						{t({ message: `Resize to ${suggestedName}` })}
					</DropdownMenuTrigger>
					<DropdownMenuContent
						align="end"
						side="top"
						className="min-w-64"
						onCloseAutoFocus={onCloseAutoFocus}
					>
						<MachineSizeMenuItems
							workspaceId={workspaceId}
							menu="dropdown"
							runAfterClose={runAfterClose}
							suggestedSize={suggested}
						/>
					</DropdownMenuContent>
				</DropdownMenu>
			) : null}
			<button
				type="button"
				onClick={() => dismiss(workspaceId, episode)}
				aria-label={t({ message: "Dismiss" })}
				className="shrink-0 rounded p-0.5 text-foreground/70 hover:bg-destructive/20 hover:text-foreground"
			>
				<LuX className="size-3.5" />
			</button>
		</div>
	);
}
