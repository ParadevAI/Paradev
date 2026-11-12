import { cn } from "@superset/ui/utils";
import {
	CircleAlert,
	CircleCheck,
	CircleDashed,
	GitMerge,
	ListChecks,
	type LucideIcon,
	TriangleAlert,
} from "lucide-react";
import type { PullRequestStackVerdict as Verdict } from "../../../../utils/assessPullRequestStack";
import { PR_STATE_INK_CLASS_NAME } from "../../../PullRequestStateGlyph";
import {
	PR_GREEN_TEXT_CLASS_NAME,
	PR_RED_TEXT_CLASS_NAME,
} from "../../../pull-request-colors";

const VERDICT_INK_CLASS_NAME: Record<Verdict, string> = {
	ready: PR_GREEN_TEXT_CLASS_NAME,
	attention: PR_RED_TEXT_CLASS_NAME,
	unstable: PR_STATE_INK_CLASS_NAME.queued,
	queued: PR_STATE_INK_CLASS_NAME.queued,
	pending: "text-muted-foreground",
	merged: PR_STATE_INK_CLASS_NAME.merged,
};

const VERDICT_ICON: Record<Verdict, LucideIcon> = {
	ready: CircleCheck,
	attention: CircleAlert,
	unstable: TriangleAlert,
	queued: ListChecks,
	pending: CircleDashed,
	merged: GitMerge,
};

export function PullRequestStackVerdict({
	verdict,
	label,
	summary,
	reason,
}: {
	verdict: Verdict;
	label: string;
	summary: string;
	reason: string | null;
}) {
	const Icon = VERDICT_ICON[verdict];
	return (
		<div className="border-b border-border/60 px-3.5 py-2.5">
			<div className="flex items-center gap-2.5">
				<Icon
					aria-hidden
					strokeWidth={2}
					className={cn("size-4 shrink-0", VERDICT_INK_CLASS_NAME[verdict])}
				/>
				<span
					className={cn(
						"text-sm font-medium",
						verdict === "pending"
							? "text-foreground"
							: VERDICT_INK_CLASS_NAME[verdict],
					)}
				>
					{label}
				</span>
			</div>
			<div className="mt-0.5 truncate pl-[26px] text-xs text-muted-foreground">
				{summary}
			</div>
			{reason ? (
				<div className="mt-1.5 pl-[26px] text-xs leading-4 text-foreground/85">
					{reason}
				</div>
			) : null}
		</div>
	);
}
