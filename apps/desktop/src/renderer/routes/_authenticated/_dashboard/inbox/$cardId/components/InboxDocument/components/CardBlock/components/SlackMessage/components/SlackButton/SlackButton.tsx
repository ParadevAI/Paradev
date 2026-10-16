import { cn } from "@superset/ui/utils";
import type { SlackButtonView } from "../../types";

interface SlackButtonProps {
	button: SlackButtonView;
	/** The message in Slack, for a button that only works there. */
	permalink: string | null;
}

export function SlackButton({ button, permalink }: SlackButtonProps) {
	const href = button.url ?? permalink;
	return (
		<a
			href={href ?? undefined}
			target="_blank"
			rel="noreferrer"
			aria-disabled={!href}
			className={cn(
				"inline-flex h-7 items-center rounded-md border px-3 text-[13px] font-semibold transition-colors",
				button.style === "primary"
					? "border-transparent bg-primary text-primary-foreground"
					: button.style === "danger"
						? "border-border text-destructive"
						: "border-border text-foreground",
				href
					? button.style === "primary"
						? "hover:opacity-90"
						: "hover:bg-fill-hover"
					: "pointer-events-none opacity-60",
			)}
		>
			{button.text}
		</a>
	);
}
