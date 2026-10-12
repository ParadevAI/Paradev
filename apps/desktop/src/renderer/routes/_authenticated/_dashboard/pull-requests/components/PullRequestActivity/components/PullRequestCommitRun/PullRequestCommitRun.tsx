import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type {
	PullRequestDetailCommit,
	PullRequestDetailCommitAuthor,
} from "../../../../hooks/usePullRequestDetail";
import { usePullRequestActivityLayout } from "../../../../providers/PullRequestActivityLayoutProvider";
import { describePullRequestTime } from "../../../../utils/describePullRequestTime";
import { pullRequestAuthorLabel } from "../../../../utils/pullRequestAuthorLabel";
import { PullRequestActivityAvatar } from "../../../PullRequestActivityAvatar";
import { PullRequestFoldRow } from "../../../PullRequestFoldRow";
import { PullRequestTimelineEventLine } from "../PullRequestTimelineEventLine";
import { PullRequestTimelineStop } from "../PullRequestTimelineStop";
import { PullRequestCommitLink } from "./components/PullRequestCommitLink";
import { PullRequestCommitStop } from "./components/PullRequestCommitStop";

interface PullRequestCommitRunProps {
	author: PullRequestDetailCommitAuthor | null;
	commits: PullRequestDetailCommit[];
	first: boolean;
	last: boolean;
}

/** One push: "name added N commits · time", then each commit; a narrow pane folds the commits behind the line. */
export function PullRequestCommitRun({
	author,
	commits,
	first,
	last,
}: PullRequestCommitRunProps) {
	const { t } = useLingui();
	const layout = usePullRequestActivityLayout();
	const count = commits.length;
	const action = t({
		message: plural(count, {
			one: "added a commit",
			other: "added # commits",
		}),
	});
	const time = describePullRequestTime(commits[count - 1]?.committedDate);
	if (layout === "row") {
		return (
			<li>
				<PullRequestFoldRow
					author={author}
					meta={<span>{action}</span>}
					time={time}
				>
					<ol className="flex flex-col gap-1">
						{commits.map((commit) => (
							<li key={commit.oid}>
								<PullRequestCommitLink commit={commit} />
							</li>
						))}
					</ol>
				</PullRequestFoldRow>
			</li>
		);
	}
	return (
		<>
			<PullRequestTimelineStop
				first={first}
				last={false}
				node={<PullRequestActivityAvatar author={author} />}
			>
				<PullRequestTimelineEventLine
					name={pullRequestAuthorLabel(author)}
					action={action}
					time={time}
				/>
			</PullRequestTimelineStop>
			{commits.map((commit, index) => (
				<PullRequestCommitStop
					key={commit.oid}
					commit={commit}
					last={last && index === count - 1}
				/>
			))}
		</>
	);
}
