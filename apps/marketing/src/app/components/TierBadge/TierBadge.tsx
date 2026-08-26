export const TIER_NAMES = [
	"Button pusher",
	"Operator",
	"Plant Manager",
	"Henry Ford",
] as const;

const TIER_STYLES = [
	"text-muted-foreground border-border",
	"text-sky-400 border-sky-400/30",
	"text-emerald-400 border-emerald-400/30",
	"text-brand border-brand/40",
] as const;

export const tierLabel = (tier: number): string =>
	tier >= 1 && tier <= 4 ? (TIER_NAMES[tier - 1] ?? "Unranked") : "Unranked";

interface TierBadgeProps {
	tier: number;

	size?: "sm" | "hero";
	className?: string;
}

export function TierBadge({
	tier,
	size = "sm",
	className = "",
}: TierBadgeProps) {
	const ranked = tier >= 1 && tier <= 4;
	const style = ranked
		? (TIER_STYLES[tier - 1] ?? TIER_STYLES[0])
		: "text-muted-foreground/60 border-border/60";

	if (size === "hero") {
		return (
			<div
				className={`inline-flex flex-col items-center border px-8 py-4 ${style} ${className}`}
			>
				<span className="font-mono text-[0.58rem] uppercase tracking-[0.2em] opacity-60">
					{ranked ? `Factory tier ${tier}` : "Unranked"}
				</span>
				<span className="text-2xl md:text-3xl mt-1.5 tracking-tight">
					{tierLabel(tier)}
				</span>
			</div>
		);
	}

	return (
		<span
			className={`inline-block border px-2 py-0.5 font-mono text-[0.62rem] uppercase tracking-[0.1em] whitespace-nowrap ${style} ${className}`}
		>
			{tierLabel(tier)}
		</span>
	);
}
