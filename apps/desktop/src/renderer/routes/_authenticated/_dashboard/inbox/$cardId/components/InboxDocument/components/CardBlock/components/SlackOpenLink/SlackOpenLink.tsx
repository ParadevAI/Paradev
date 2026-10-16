import { Trans } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { LuExternalLink } from "react-icons/lu";

interface SlackOpenLinkProps {
	href: string;
	/** Drawn as a button, where Slack is the only place the reader can act. */
	prominent?: boolean;
}

export function SlackOpenLink({ href, prominent }: SlackOpenLinkProps) {
	return (
		<a
			href={href}
			target="_blank"
			rel="noreferrer"
			className={cn(
				"inline-flex shrink-0 items-center gap-1 text-xs",
				prominent
					? "h-8 rounded-md border border-input px-3 font-medium text-foreground hover:bg-fill-hover"
					: "text-muted-foreground hover:text-foreground",
			)}
		>
			<Trans>Open in Slack</Trans>
			<LuExternalLink className="size-3" />
		</a>
	);
}
