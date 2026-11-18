import { useLingui } from "@lingui/react/macro";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";
import { cn } from "@superset/ui/utils";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { QuotaWindowRow } from "renderer/components/QuotaWindowRow";
import { QUOTA_AGENT_LABELS } from "renderer/utils/usage/quotaAgentLabels";
import {
	type QuotaMeterTone,
	quotaMeterTone,
} from "renderer/utils/usage/quotaMeterTone";
import type { RailUsageEntry } from "../../utils/selectRailUsage";

// Sized to fit the 36px rail button: two tracks get a larger box, thinner
// strokes and a smaller glyph so the glyph clears the inner track.
const SINGLE_RING = { size: 28, stroke: 2.5, iconClassName: "size-3.5" };
const DOUBLE_RING = { size: 34, stroke: 2.25, iconClassName: "size-3" };
const RING_SPACING = 4.5;

const WINDOW_ROW_CLASS = "grid-cols-[minmax(0,7rem)_1fr_2.5rem_4.5rem] gap-2.5";

const RING_STROKE_CLASS: Record<QuotaMeterTone, string> = {
	normal: "stroke-muted-foreground/60 group-hover:stroke-foreground",
	warning: "stroke-amber-500/30 group-hover:stroke-amber-500",
	danger: "stroke-red-500/30 group-hover:stroke-red-500",
};

export function RailUsageRing({
	entry,
	onOpen,
}: {
	entry: RailUsageEntry;
	onOpen: () => void;
}) {
	const { t } = useLingui();
	const isDark = useIsDarkTheme();
	const { account, rings } = entry;
	const label = QUOTA_AGENT_LABELS[account.agent];
	const icon = getPresetIcon(account.agent, isDark);
	const geometry = rings.length > 1 ? DOUBLE_RING : SINGLE_RING;
	const center = geometry.size / 2;
	const outerRadius = (geometry.size - geometry.stroke) / 2;
	const primaryWindows = account.windows.filter(
		(window) => !window.id.includes(":"),
	);
	const scopedWindows = account.windows.filter((window) =>
		window.id.includes(":"),
	);
	const summary = rings
		.map((ring) => `${ring.label} ${ring.usedPercent}%`)
		.join(", ");

	return (
		<HoverCard openDelay={0} closeDelay={80}>
			<HoverCardTrigger asChild>
				<button
					type="button"
					aria-label={t({
						message: `${label} quota used: ${summary}. Open usage settings`,
					})}
					onClick={onOpen}
					className="group relative flex size-9 items-center justify-center rounded-[10px] text-muted-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
				>
					<svg
						viewBox={`0 0 ${geometry.size} ${geometry.size}`}
						width={geometry.size}
						height={geometry.size}
						className="-rotate-90"
						fill="none"
						aria-hidden="true"
					>
						{rings.map((ring, index) => {
							const radius = outerRadius - index * RING_SPACING;
							const used = Math.min(100, Math.max(0, ring.usedPercent));
							return (
								<g key={ring.id}>
									<circle
										cx={center}
										cy={center}
										r={radius}
										strokeWidth={geometry.stroke}
										className="stroke-current opacity-15"
									/>
									{used > 0 && (
										<circle
											cx={center}
											cy={center}
											r={radius}
											strokeWidth={geometry.stroke}
											strokeLinecap="round"
											pathLength={100}
											strokeDasharray={`${used} 100`}
											className={cn(
												"transition-[stroke-dasharray,stroke] duration-500 motion-reduce:transition-none",
												RING_STROKE_CLASS[quotaMeterTone(ring.usedPercent)],
											)}
										/>
									)}
								</g>
							);
						})}
					</svg>
					{icon && (
						<img
							src={icon}
							alt=""
							className={cn("absolute object-contain", geometry.iconClassName)}
						/>
					)}
				</button>
			</HoverCardTrigger>
			<HoverCardContent
				side="right"
				align="end"
				sideOffset={10}
				className="w-80 rounded-lg p-0 duration-100"
			>
				<div className="flex items-center gap-2 border-b px-3 py-2.5">
					{icon && <img src={icon} alt="" className="size-4 object-contain" />}
					<span className="truncate text-[13px] font-medium">{label}</span>
					{account.plan && (
						<span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium uppercase leading-none tracking-wide text-muted-foreground">
							{account.plan}
						</span>
					)}
				</div>
				<div className="space-y-2 px-3 py-2.5">
					{primaryWindows.map((window) => (
						<QuotaWindowRow
							key={window.id}
							window={window}
							className={WINDOW_ROW_CLASS}
						/>
					))}
				</div>
				{scopedWindows.length > 0 && (
					<div className="space-y-2 border-t px-3 py-2.5">
						{scopedWindows.map((window) => (
							<QuotaWindowRow
								key={window.id}
								window={window}
								className={WINDOW_ROW_CLASS}
							/>
						))}
					</div>
				)}
			</HoverCardContent>
		</HoverCard>
	);
}
