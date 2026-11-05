import { useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";

function secondsSince(startedAtMs: number) {
	return Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
}

export function RunningTime({ startedAtMs }: { startedAtMs: number }) {
	const { t } = useLingui();
	const [seconds, setSeconds] = useState(() => secondsSince(startedAtMs));

	useEffect(() => {
		setSeconds(secondsSince(startedAtMs));
		const timer = setInterval(
			() => setSeconds(secondsSince(startedAtMs)),
			1000,
		);
		return () => clearInterval(timer);
	}, [startedAtMs]);

	const minutes = Math.floor(seconds / 60);
	const rest = seconds % 60;
	return (
		<span className="shrink-0 font-mono text-[11px] text-muted-foreground/70 tabular-nums">
			{minutes > 0 ? t`${minutes}m ${rest}s` : t`${seconds}s`}
		</span>
	);
}
