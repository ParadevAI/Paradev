import { useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { type ReactNode, useState } from "react";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";

const FEEDBACK_MS = 1500;

interface PullRequestCopyTextProps {
	/** What lands on the clipboard; also shown in full in the tooltip, since the text may be truncated. */
	value: string;
	/** The action, under the value in the tooltip. */
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
	const { copyToClipboard, copied } = useCopyToClipboard(FEEDBACK_MS);
	const [failed, setFailed] = useState(false);
	const copy = () => {
		setFailed(false);
		copyToClipboard(value).catch((error: unknown) => {
			console.warn("[PullRequestCopyText] copy failed", error);
			setFailed(true);
			setTimeout(() => setFailed(false), FEEDBACK_MS);
		});
	};
	return (
		<Tooltip open={copied || failed ? true : undefined}>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={copy}
					className={cn(
						"-mx-1 min-w-0 cursor-pointer rounded px-1 text-left transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
						className,
					)}
				>
					{children}
				</button>
			</TooltipTrigger>
			<TooltipContent side="bottom" className="max-w-sm">
				{failed ? (
					t({ message: "Copy failed" })
				) : copied ? (
					t({ message: "Copied" })
				) : value === label ? (
					label
				) : (
					<span className="flex flex-col gap-0.5">
						<span className="break-all font-medium">{value}</span>
						<span className="opacity-70">{label}</span>
					</span>
				)}
			</TooltipContent>
		</Tooltip>
	);
}
