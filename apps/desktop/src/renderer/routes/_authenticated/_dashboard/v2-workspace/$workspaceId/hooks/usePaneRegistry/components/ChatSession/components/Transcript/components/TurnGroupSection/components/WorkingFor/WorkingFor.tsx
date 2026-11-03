import { useLingui } from "@lingui/react/macro";
import { Shimmer } from "@superset/ui/ai-elements/shimmer";
import { cn } from "@superset/ui/utils";
import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

const CLOCK_SWEEP_SECONDS = 1;

function elapsed(startedAtMs: number, completedAtMs: number | undefined) {
	const end = completedAtMs ?? Date.now();
	return Math.max(0, Math.floor((end - startedAtMs) / 1000));
}

/**
 * The turn's one live line, under the prompt: it sweeps while the agent works
 * and stays afterwards as "Worked for 8s", so a finished turn still says what
 * it cost. It stops while the turn waits on the user. `onToggle` hangs the
 * turn's work off it.
 */
export function WorkingFor({
	completedAtMs,
	expanded,
	onToggle,
	startedAtMs,
	waiting = false,
}: {
	startedAtMs: number;
	completedAtMs?: number | undefined;
	expanded?: boolean | undefined;
	onToggle?: (() => void) | undefined;
	waiting?: boolean | undefined;
}) {
	const { t } = useLingui();
	const running = completedAtMs === undefined;
	const ticking = running && !waiting;
	const [seconds, setSeconds] = useState(() =>
		elapsed(startedAtMs, completedAtMs),
	);

	useEffect(() => {
		setSeconds(elapsed(startedAtMs, completedAtMs));
		if (!ticking) return;
		const timer = setInterval(
			() => setSeconds(elapsed(startedAtMs, undefined)),
			1000,
		);
		return () => clearInterval(timer);
	}, [startedAtMs, completedAtMs, ticking]);

	if (!running && seconds === 0 && !onToggle) return null;

	const label = waiting
		? t({ message: "Needs input" })
		: seconds < 60
			? running
				? t`Working for ${seconds}s`
				: t`Worked for ${seconds}s`
			: running
				? t`Working for ${Math.floor(seconds / 60)}m ${seconds % 60}s`
				: t`Worked for ${Math.floor(seconds / 60)}m ${seconds % 60}s`;

	const content = (
		<>
			{ticking ? (
				<Shimmer
					className="min-w-0 truncate"
					duration={CLOCK_SWEEP_SECONDS}
					variant="text"
				>
					{label}
				</Shimmer>
			) : (
				<span className="min-w-0 truncate">{label}</span>
			)}
			{onToggle && (
				<ChevronRight
					className={cn(
						"size-3.5 shrink-0 text-foreground/45 transition-transform",
						expanded && "rotate-90",
					)}
				/>
			)}
		</>
	);

	return (
		<div className="flex min-w-0 items-center gap-1.5 py-1 font-sans text-foreground/50 text-sm">
			{onToggle ? (
				<button
					className="flex min-w-0 items-center gap-1.5 transition-colors duration-200 hover:text-foreground/80"
					onClick={onToggle}
					type="button"
				>
					{content}
				</button>
			) : (
				content
			)}
		</div>
	);
}
