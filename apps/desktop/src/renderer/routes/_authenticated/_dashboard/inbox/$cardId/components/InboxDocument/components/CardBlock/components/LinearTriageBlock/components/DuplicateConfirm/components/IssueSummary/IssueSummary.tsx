import { Trans } from "@lingui/react/macro";
import { formatRelativeTime } from "@superset/i18n/format";
import { LuCircleUserRound } from "react-icons/lu";
import type {
	LinearIssueView,
	LinearPersonView,
} from "../../../../../../types";
import { LinearAvatar } from "../../../../../LinearAvatar";
import { LinearStateIcon } from "../../../../../LinearStateIcon";

interface IssueSummaryProps {
	issue: LinearIssueView;
	members: readonly LinearPersonView[];
}

/** An issue in Linear's duplicate confirmation: id and title, then status, assignee and age. */
export function IssueSummary({ issue, members }: IssueSummaryProps) {
	const assignee = members.find(
		(member) => member.id === issue.fields.assignee,
	);
	const age = formatRelativeTime(Date.parse(issue.createdAt));
	return (
		<div data-issue={issue.identifier} className="flex flex-col gap-1.5">
			<div className="flex items-baseline gap-2 text-[13px]">
				<span className="shrink-0 tabular-nums text-muted-foreground">
					{issue.identifier}
				</span>
				<span className="min-w-0 font-medium text-foreground">
					{issue.title}
				</span>
			</div>
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
				<span className="inline-flex items-center gap-1.5">
					<LinearStateIcon state={issue.state} />
					{issue.state.name}
				</span>
				<span className="inline-flex items-center gap-1.5">
					{assignee ? (
						<>
							<LinearAvatar person={assignee} className="size-4 text-[9px]" />
							<span className="text-foreground">{assignee.name}</span>
						</>
					) : (
						<>
							<LuCircleUserRound className="size-3.5" />
							<Trans>Unassigned</Trans>
						</>
					)}
				</span>
				<span className="ml-auto">
					<Trans>Created {age}</Trans>
				</span>
			</div>
		</div>
	);
}
