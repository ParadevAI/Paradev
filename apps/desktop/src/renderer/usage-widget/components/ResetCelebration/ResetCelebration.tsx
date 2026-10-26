import { Trans } from "@lingui/react/macro";
import { useEffect, useRef } from "react";
import { drawResetCelebration } from "./particles";

export function ResetCelebration({
	kind,
	label,
}: {
	kind: "session" | "weekly";
	label: string;
}) {
	const canvas = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		document.documentElement.classList.add("reset-celebrating");
		const reduced = matchMedia("(prefers-reduced-motion: reduce)");
		const stop =
			canvas.current && !reduced.matches
				? drawResetCelebration(canvas.current, kind)
				: () => {};
		reduced.addEventListener("change", stop);
		return () => {
			stop();
			reduced.removeEventListener("change", stop);
			document.documentElement.classList.remove("reset-celebrating");
		};
	}, [kind]);
	return (
		<output className="usage-reset-stage" aria-live="polite">
			<canvas ref={canvas} tabIndex={-1} aria-hidden="true" />
			<div className={`usage-reset-toast ${kind}`}>
				<div className="usage-reset-emblem" aria-hidden="true">
					{kind === "weekly" ? "✦" : "↻"}
				</div>
				<div>
					<strong>
						{kind === "weekly" ? (
							<Trans>Weekly allowance renewed</Trans>
						) : (
							<Trans>Session allowance renewed</Trans>
						)}
					</strong>
					<p>{label}</p>
				</div>
			</div>
		</output>
	);
}
