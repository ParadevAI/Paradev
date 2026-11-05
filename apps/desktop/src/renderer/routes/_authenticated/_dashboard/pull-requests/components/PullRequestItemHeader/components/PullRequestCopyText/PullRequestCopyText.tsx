import { useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";

interface PullRequestCopyTextProps {
	/** What lands on the clipboard; may differ from what is shown. */
	value: string;
	/** The tooltip before the click. */
	label: string;
	children: ReactNode;
	className?: string;
}

/** Header text that copies on click and says so. */
export function PullRequestCopyText({
	value,
	label,
	children,
	className,
}: PullRequestCopyTextProps) {
	const { t } = useLingui();
	const { copyToClipboard, copied } = useCopyToClipboard(1500);
	return (
		<Tooltip open={copied ? true : undefined}>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={() => void copyToClipboard(value).catch(() => {})}
					className={cn(
						"-mx-1 min-w-0 cursor-pointer rounded px-1 text-left transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
						className,
					)}
				>
					{children}
				</button>
			</TooltipTrigger>
			<TooltipContent side="bottom">
				{copied ? t({ message: "Copied" }) : label}
			</TooltipContent>
		</Tooltip>
	);
}
