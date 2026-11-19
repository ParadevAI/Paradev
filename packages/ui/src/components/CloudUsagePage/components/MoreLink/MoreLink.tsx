import type { ReactNode } from "react";
import type { CloudUsageLink, CloudUsageTarget } from "../../types";

interface MoreLinkProps {
	Link: CloudUsageLink;
	to: CloudUsageTarget;
	children: ReactNode;
}

export function MoreLink({ Link, to, children }: MoreLinkProps) {
	return (
		<Link
			to={to}
			className="shrink-0 text-sm text-muted-foreground transition-colors hover:text-foreground"
		>
			{children} <span aria-hidden>→</span>
		</Link>
	);
}
