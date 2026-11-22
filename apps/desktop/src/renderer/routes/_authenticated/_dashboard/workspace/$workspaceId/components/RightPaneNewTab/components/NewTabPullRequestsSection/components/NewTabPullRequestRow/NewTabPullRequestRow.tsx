import { CloudPullRequestRow } from "renderer/routes/_authenticated/_dashboard/components/CloudPullRequestRow";
import type { NewTabLists } from "../../../../../../hooks/useNewTabLists";
import { usePullRequestCounts } from "../../../../../../hooks/usePullRequestCounts";

interface NewTabPullRequestRowProps {
	pullRequest: NewTabLists["pullRequests"][number];
	onOpen: () => void;
}

export function NewTabPullRequestRow({
	pullRequest: pr,
	onOpen,
}: NewTabPullRequestRowProps) {
	const counts = usePullRequestCounts(pr.ref);
	return (
		<CloudPullRequestRow
			pullRequest={{
				url: pr.url,
				number: pr.number,
				title: pr.title,
				state:
					pr.state === "merged" || pr.state === "closed" ? pr.state : "open",
				isDraft: pr.isDraft || pr.state === "draft",
				...counts,
			}}
			onOpen={onOpen}
			fullWidth
		/>
	);
}
