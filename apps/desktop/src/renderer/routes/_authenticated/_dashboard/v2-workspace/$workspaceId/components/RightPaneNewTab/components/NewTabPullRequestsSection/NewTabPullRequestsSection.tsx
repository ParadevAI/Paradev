import { Trans } from "@lingui/react/macro";
import type { CreatePaneInput } from "@superset/panes";
import { CloudSection } from "renderer/routes/_authenticated/_dashboard/components/CloudSection";
import type { NewTabLists } from "../../../../hooks/useNewTabLists";
import type { PaneViewerData } from "../../../../types";
import { NewTabPullRequestRow } from "./components/NewTabPullRequestRow";

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
					<NewTabPullRequestRow
						key={pr.url}
						pullRequest={pr}
						onOpen={() => onOpen({ kind: "pull-request", data: pr.ref })}
					/>
				))}
			</div>
		</CloudSection>
	);
}
