import type { ReactNode } from "react";
import type { PullRequestDetail } from "../../hooks/usePullRequestDetail";
import {
	PullRequestActivity,
	type PullRequestActivityThreads,
} from "../PullRequestActivity";
import type { PullRequestCommentTarget } from "../PullRequestConversationComposer";
import { PullRequestInfo } from "../PullRequestInfo";
import { PullRequestItemHeader } from "../PullRequestItemHeader";
import { PullRequestMarkdown } from "../PullRequestMarkdown";
import { PullRequestPageBody } from "../PullRequestPageBody";

interface PullRequestSummaryContentProps {
	data: PullRequestDetail;
	/** Where a new conversation comment posts; null hides the composer. */
	commentTarget?: PullRequestCommentTarget | null;
	/** The workspace pane's review threads, hung on the activity rail. */
	threads?: PullRequestActivityThreads;
	aside?: ReactNode;
}

/** The Summary tab: header, info rail, description, then the Activity section. */
export function PullRequestSummaryContent({
	data,
	commentTarget = null,
	threads,
	aside,
}: PullRequestSummaryContentProps) {
	return (
		<PullRequestPageBody
			header={
				<PullRequestItemHeader data={data} actionTarget={commentTarget} />
			}
			info={(variant) => <PullRequestInfo data={data} variant={variant} />}
			aside={aside}
		>
			<PullRequestMarkdown body={data.body} />
			<div className="mt-8">
				<PullRequestActivity
					data={data}
					commentTarget={commentTarget}
					threads={threads}
				/>
			</div>
		</PullRequestPageBody>
	);
}
