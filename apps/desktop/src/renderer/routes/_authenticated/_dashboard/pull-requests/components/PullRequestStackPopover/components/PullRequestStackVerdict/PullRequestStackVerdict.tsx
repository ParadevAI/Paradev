import { cn } from "@superset/ui/utils";
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
	pending: "text-muted-foreground",
	merged: PR_STATE_INK_CLASS_NAME.merged,
};

export function PullRequestStackVerdict({
	verdict,
	label,
	summary,
}: {
	verdict: Verdict;
	label: string;
	summary: string;
}) {
	return (
		<div className="border-b border-border/60 px-3.5 py-2.5">
			<div
				className={cn("text-sm font-medium", VERDICT_INK_CLASS_NAME[verdict])}
			>
				{label}
			</div>
			<div className="mt-0.5 truncate text-xs text-muted-foreground">
				{summary}
			</div>
		</div>
	);
}
