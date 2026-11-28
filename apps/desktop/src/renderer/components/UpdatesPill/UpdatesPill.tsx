import { Trans } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { LuCircleArrowUp, LuCircleCheck } from "react-icons/lu";
import { PreUpdateConfirmPopover } from "renderer/components/PreUpdateConfirmPopover";
import {
	UPDATE_CONFIRM_MS as CONFIRM_MS,
	UPDATE_EXIT_MS as EXIT_MS,
	formatUpdateVersion,
	useUpdateControl,
} from "renderer/hooks/useUpdateControl";
import { CountdownBorder } from "./CountdownBorder";
import { DownloadRing } from "./DownloadRing";

const STROKE_WIDTH = 1.5;

/**
 * Compact version for the inline pill — canary builds carry a timestamp
 * suffix ("1.14.1-canary.20260711221936") that would overflow the sidebar
 * footer, so shorten to "1.14.1-ca".
 */
function displayVersion(version: string): string {
	const [base, prereleaseTag] = version.split("-", 2);
	return prereleaseTag ? `${base}-${prereleaseTag.slice(0, 2)}` : base;
}

interface UpdatesPillProps {
	isCollapsed?: boolean;
}

/**
 * Compact auto-update indicator that lives in the sidebar's bottom
 * settings cluster: a progress ring while downloading, a quiet
 * "↑ update" pill with a green ready dot (click to install), a micro
 * ASCII loader while installing, and a red "↻ retry" pill on failure.
 * Renders nothing while the app is up to date.
 */
export function UpdatesPill({ isCollapsed = false }: UpdatesPillProps) {
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

	const isDownloading = phase === "downloading";
	const isError = phase === "error";
	const isReady = phase === "ready";
	const isInstalling = phase === "installing";
	const isUpdated = phase === "updated";
	const isBusy = isDownloading || isInstalling || isUpdated;
	const isDissolving = isLeaving;
	const handleClick = activate;

	const shortVersion = version ? ` v${formatUpdateVersion(version)}` : "";
	const tooltip = isInstalling
		? "Installing update…"
		: isDownloading
			? `Downloading${shortVersion || " update"}`
			: isError
				? `${(error ?? "Update failed").replace(/[.\s]+$/, "")}. Click to retry`
				: isUpdated
					? `Updated${shortVersion ? ` to${shortVersion}` : ""}`
					: `Install${shortVersion || " update"}. Sessions keep running`;

	const pill = isCollapsed ? (
		<Tooltip delayDuration={1000}>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={handleClick}
					aria-disabled={isBusy}
					aria-label={tooltip}
					className={cn(
						"relative flex size-8 items-center justify-center rounded-md",
						"animate-in fade-in duration-300",
						isBusy
							? "cursor-default text-muted-foreground"
							: "hover:bg-accent/50",
					)}
					style={
						isDissolving
							? { animation: `pill-pixel-out ${EXIT_MS}ms steps(3) both` }
							: undefined
					}
				>
					{isUpdated && <CountdownBorder durationMs={CONFIRM_MS} radius={5} />}
					{isDownloading ? (
						<DownloadRing percent={percent} className="size-3.5" />
					) : isInstalling ? (
						<span className="font-mono text-xs leading-none text-orange-600 dark:text-orange-300 braille-spin" />
					) : isUpdated ? (
						<LuCircleCheck
							strokeWidth={STROKE_WIDTH}
							className="size-4 text-emerald-600 dark:text-emerald-400"
						/>
					) : (
						<>
							<LuCircleArrowUp
								strokeWidth={STROKE_WIDTH}
								className={cn(
									"size-4",
									isError ? "text-destructive" : "text-muted-foreground",
								)}
							/>
							{isReady && (
								<span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-emerald-500 ring-2 ring-sidebar" />
							)}
						</>
					)}
				</button>
			</TooltipTrigger>
			<TooltipContent side="right">{tooltip}</TooltipContent>
		</Tooltip>
	) : (
		<Tooltip delayDuration={1000}>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={handleClick}
					aria-disabled={isBusy}
					aria-label={isInstalling ? tooltip : undefined}
					className={cn(
						"relative inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1",
						"font-mono text-[10px] tabular-nums leading-none",
						"ring-1 ring-inset animate-in fade-in slide-in-from-bottom-1 duration-300",
						isBusy && "cursor-default",
						!isError && "bg-foreground/[0.045] ring-foreground/[0.06]",
						(isDownloading || isUpdated) && "text-muted-foreground",
						isInstalling && "text-orange-600 dark:text-orange-300",
						isReady &&
							"text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground",
						isError &&
							"bg-destructive/10 ring-destructive/25 text-destructive hover:bg-destructive/20",
					)}
					style={
						isDissolving
							? { animation: `pill-pixel-out ${EXIT_MS}ms steps(3) both` }
							: undefined
					}
				>
					{isUpdated && (
						<CountdownBorder durationMs={CONFIRM_MS} radius="pill" />
					)}
					{isInstalling ? (
						<>
							<span
								aria-hidden="true"
								className="w-3 text-center text-xs leading-none braille-spin"
							/>
							<span
								aria-hidden="true"
								className="tracking-tighter before:animate-[ascii-bar_480ms_step-end_infinite]"
							/>
						</>
					) : isDownloading ? (
						<>
							<DownloadRing percent={percent} className="size-3" />
							<span>{percent !== null ? `${Math.floor(percent)}%` : "…"}</span>
						</>
					) : isUpdated ? (
						<>
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								aria-hidden="true"
								className="size-3 shrink-0 text-emerald-600 dark:text-emerald-400"
							>
								<path
									d="M4.5 12.5l5 5L20 6.5"
									strokeWidth={3}
									strokeLinecap="round"
									strokeLinejoin="round"
									style={{
										strokeDasharray: 26,
										animation:
											"check-draw 0.45s cubic-bezier(0.5, 0, 0.25, 1) 0.05s both",
									}}
								/>
							</svg>
							<span>
								{version ? (
									`v${displayVersion(version)}`
								) : (
									<Trans>downloaded</Trans>
								)}
							</span>
						</>
					) : isReady ? (
						<>
							<span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
							<span>
								<Trans>↑ update</Trans>
							</span>
						</>
					) : (
						<>
							<span className="size-1.5 shrink-0 rounded-full bg-destructive animate-pulse" />
							<span>
								<Trans>↻ retry</Trans>
							</span>
						</>
					)}
				</button>
			</TooltipTrigger>
			<TooltipContent side="top">{tooltip}</TooltipContent>
		</Tooltip>
	);

	return (
		<PreUpdateConfirmPopover {...preUpdateConfirm}>
			{pill}
		</PreUpdateConfirmPopover>
	);
}
