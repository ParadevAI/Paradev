import { Trans } from "@lingui/react/macro";
import type { CreatePaneInput } from "@superset/panes";
import { pullRequestRefFromUrl } from "renderer/lib/github/pullRequestRef";
import { CloudPullRequestRow } from "renderer/routes/_authenticated/_dashboard/components/CloudPullRequestRow";
import { CloudSection } from "renderer/routes/_authenticated/_dashboard/components/CloudSection";
import type { NewTabLists } from "../../../../hooks/useNewTabLists";
import type { PaneViewerData } from "../../../../types";

interface NewTabPullRequestsSectionProps {
	pullRequests: NewTabLists["pullRequests"];
	onOpen: (pane: CreatePaneInput<PaneViewerData>) => void;
}

export function NewTabPullRequestsSection({
	pullRequests,
	onOpen,
}: NewTabPullRequestsSectionProps) {
	if (pullRequests.length === 0) return null;

	return (
		<CloudSection title={<Trans>Pull requests</Trans>}>
			<div className="flex flex-col">
				{pullRequests.map((row) => (
					<CloudPullRequestRow
						key={row.id}
						pullRequest={{
							url: row.url,
							number: row.prNumber,
							title: row.title,
							state: "open",
							isDraft: row.isDraft,
							additions: row.additions,
							deletions: row.deletions,
						}}
						onOpen={() => {
							const ref = pullRequestRefFromUrl(row.url);
							if (ref) onOpen({ kind: "pull-request", data: ref });
						}}
					/>
				))}
			</div>
		</CloudSection>
	);
}
