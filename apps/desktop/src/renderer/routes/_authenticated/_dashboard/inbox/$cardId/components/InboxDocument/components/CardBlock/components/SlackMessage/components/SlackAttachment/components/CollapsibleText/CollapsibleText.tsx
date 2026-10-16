import { Trans } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

interface CollapsibleTextProps {
	children: ReactNode;
}

/** Long app text cut to a few lines with "Show more", the way Slack folds an attachment. */
export function CollapsibleText({ children }: CollapsibleTextProps) {
	const ref = useRef<HTMLDivElement>(null);
	const [expanded, setExpanded] = useState(false);
	const [overflows, setOverflows] = useState(false);

	useLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;
		const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	return (
		<div className="text-foreground">
			<div
				ref={ref}
				className={cn(!expanded && "max-h-[8.125rem] overflow-hidden")}
			>
				{children}
			</div>
			{(overflows || expanded) && (
				<button
					type="button"
					onClick={() => setExpanded((value) => !value)}
					className="text-blue-500 hover:underline dark:text-sky-400"
				>
					{expanded ? <Trans>Show less</Trans> : <Trans>Show more</Trans>}
				</button>
			)}
		</div>
	);
}
