import { useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { LuArrowUp, LuCheck, LuRotateCw } from "react-icons/lu";
import { PreUpdateConfirmPopover } from "renderer/components/PreUpdateConfirmPopover";
import {
	formatUpdateVersion,
	UPDATE_EXIT_MS,
	useUpdateControl,
} from "renderer/hooks/useUpdateControl";
import { DitherFill } from "./components/DitherFill";

const ICON_STROKE_WIDTH = 2;

/** One fixed width in every state, so the title bar moves only when it appears and leaves. */
export function UpdateButton() {
	const { t } = useLingui();
	const {
		phase,
		isLeaving,
		version,
		percent,
		error,
		activate,
		preUpdateConfirm,
	} = useUpdateControl();

	if (!phase) return null;

	const isActionable = phase === "ready" || phase === "error";
	const versionLabel = version ? `v${formatUpdateVersion(version)}` : null;

	const label = {
		downloading:
			percent !== null
				? `${Math.floor(percent)}%`
				: t({ message: "Updating…" }),
		ready: t({ message: "Update" }),
		installing: t({ message: "Updating…" }),
		error: t({ message: "Retry" }),
		updated: t({ message: "Updated" }),
	}[phase];

	const hint = {
		downloading: t({ message: "Downloading update" }),
		ready: t({ message: "Install the update. Sessions keep running" }),
		installing: t({ message: "Updating…" }),
		error: error ?? t({ message: "Update failed" }),
		updated: t({ message: "Updated" }),
	}[phase];
	const tooltip =
		versionLabel && phase !== "error" ? `${hint} · ${versionLabel}` : hint;

	return (
		<div className="no-drag flex px-1.5 animate-in fade-in zoom-in-95 duration-300">
			<PreUpdateConfirmPopover {...preUpdateConfirm} side="bottom">
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={activate}
							aria-disabled={!isActionable}
							aria-label={tooltip}
							className={cn(
								"relative flex h-6 w-[76px] shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md text-xs font-medium tabular-nums outline-none transition-[background-color,color,opacity] focus-visible:ring-1 focus-visible:ring-ring",
								!isActionable && "cursor-default",
								isLeaving && "opacity-0",
								phase === "ready" &&
									"bg-highlight text-highlight-foreground hover:bg-highlight/90",
								(phase === "downloading" || phase === "installing") &&
									"bg-fill-hover/60 text-foreground",
								phase === "updated" && "text-muted-foreground",
								phase === "error" &&
									"bg-destructive/10 text-destructive ring-1 ring-inset ring-destructive/25 hover:bg-destructive/15",
							)}
							style={{ transitionDuration: `${UPDATE_EXIT_MS}ms` }}
						>
							{(phase === "downloading" || phase === "installing") && (
								<DitherFill
									percent={phase === "downloading" ? percent : null}
									className="opacity-40"
								/>
							)}
							{phase === "ready" && (
								<LuArrowUp
									className="relative size-3.5"
									strokeWidth={ICON_STROKE_WIDTH}
								/>
							)}
							{phase === "updated" && (
								<LuCheck
									className="relative size-3.5 text-highlight"
									strokeWidth={ICON_STROKE_WIDTH}
								/>
							)}
							{phase === "error" && (
								<LuRotateCw
									className="relative size-3.5"
									strokeWidth={ICON_STROKE_WIDTH}
								/>
							)}
							<span className="relative truncate">{label}</span>
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom">{tooltip}</TooltipContent>
				</Tooltip>
			</PreUpdateConfirmPopover>
		</div>
	);
}
