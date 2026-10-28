import { Trans } from "@lingui/react/macro";
import type { CreatePaneInput } from "@superset/panes";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { pullRequestRefFromUrl } from "renderer/lib/github/pullRequestRef";
import { CloudPullRequestRow } from "renderer/routes/_authenticated/_dashboard/components/CloudPullRequestRow";
import { CloudSection } from "renderer/routes/_authenticated/_dashboard/components/CloudSection";
import type { PaneViewerData } from "../../../../types";

const PULL_REQUEST_LIMIT = 5;

interface NewTabPullRequestsSectionProps {
	onOpen: (pane: CreatePaneInput<PaneViewerData>) => void;
}

export function NewTabPullRequestsSection({
	onOpen,
}: NewTabPullRequestsSectionProps) {
	const organizationId = useActiveOrganizationId();
	const { data } =
		cloudTrpc.integration.github.listOrganizationPullRequests.useQuery(
			{ organizationId: organizationId ?? "" },
			{ enabled: organizationId !== null, staleTime: 60_000 },
		);
	const pullRequests = (data ?? [])
		.filter((row) => row.state === "open")
		.slice(0, PULL_REQUEST_LIMIT);
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
