import { Trans } from "@lingui/react/macro";
import type { CreatePaneInput } from "@superset/panes";
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
				{pullRequests.map((pr) => (
					<CloudPullRequestRow
						key={pr.url}
						pullRequest={{
							url: pr.url,
							number: pr.number,
							title: pr.title,
							state:
								pr.state === "merged" || pr.state === "closed"
									? pr.state
									: "open",
							isDraft: pr.isDraft || pr.state === "draft",
						}}
						onOpen={() =>
							onOpen({
								kind: "pull-request",
								data: {
									repoFullName: `${pr.repoOwner}/${pr.repoName}`,
									number: pr.number,
								},
							})
						}
					/>
				))}
			</div>
		</CloudSection>
	);
}
