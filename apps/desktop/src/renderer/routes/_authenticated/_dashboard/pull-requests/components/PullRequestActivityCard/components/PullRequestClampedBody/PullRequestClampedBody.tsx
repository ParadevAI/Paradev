import { Trans } from "@lingui/react/macro";
import { type ReactNode, useEffect, useRef, useState } from "react";

const CLAMP_HEIGHT_PX = 180;
/** A body barely past the limit shows in full instead of hiding a line. */
const CLAMP_SLACK_PX = 48;

interface PullRequestClampedBodyProps {
	children: ReactNode;
}

/** Long bodies start folded to a scannable height, with "Show more" below. */
export function PullRequestClampedBody({
	children,
}: PullRequestClampedBodyProps) {
	const inner = useRef<HTMLDivElement>(null);
	const [overflows, setOverflows] = useState(false);
	const [expanded, setExpanded] = useState(false);

	useEffect(() => {
		const element = inner.current;
		if (!element) return;
		const measure = () =>
			setOverflows(element.scrollHeight > CLAMP_HEIGHT_PX + CLAMP_SLACK_PX);
		measure();
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		return () => observer.disconnect();
	}, []);

	const clamped = overflows && !expanded;
	return (
		<>
			<div
				style={clamped ? { maxHeight: CLAMP_HEIGHT_PX } : undefined}
				className={
					clamped
						? "overflow-hidden [mask-image:linear-gradient(to_bottom,black_60%,transparent)]"
						: undefined
				}
			>
				<div ref={inner}>{children}</div>
			</div>
			{overflows ? (
				<button
					type="button"
					aria-expanded={expanded}
					onClick={() => setExpanded((current) => !current)}
					className="mt-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
				>
					{expanded ? <Trans>Show less</Trans> : <Trans>Show more</Trans>}
				</button>
			) : null}
		</>
	);
}
