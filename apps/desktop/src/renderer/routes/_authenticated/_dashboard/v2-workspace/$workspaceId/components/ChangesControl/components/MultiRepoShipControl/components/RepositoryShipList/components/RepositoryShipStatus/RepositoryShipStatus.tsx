import { Plural, Trans } from "@lingui/react/macro";
import type { RepositoryShipSnapshot } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useRepositoryShipSnapshots";

interface RepositoryShipStatusProps {
	snapshot: RepositoryShipSnapshot | undefined;
}

export function RepositoryShipStatus({ snapshot }: RepositoryShipStatusProps) {
	if (!snapshot || snapshot.step === "loading") return <Trans>Loading…</Trans>;
	const { step, stats, sync, pr, flowState } = snapshot;
	const fileCount = stats?.fileCount ?? 0;
	const pushCount = sync?.pushCount ?? 0;
	const prNumber = pr?.number ?? 0;

	switch (step) {
		case "commit":
			return (
				<Plural
					value={fileCount}
					one="# file changed"
					other="# files changed"
				/>
			);
		case "create-pr":
			return sync && !sync.hasUpstream ? (
				<Trans>Branch not published</Trans>
			) : pushCount > 0 ? (
				<Plural
					value={pushCount}
					one="# commit not pushed"
					other="# commits not pushed"
				/>
			) : (
				<Trans>Ready for a pull request</Trans>
			);
		case "push":
			return (
				<Plural
					value={pushCount}
					one="# commit not pushed"
					other="# commits not pushed"
				/>
			);
		case "pull-request":
			return <Trans>PR #{prNumber}</Trans>;
		case "up-to-date":
			return <Trans>Nothing to ship</Trans>;
		case "unavailable":
			return flowState.kind === "unavailable" &&
				flowState.reason === "default-branch" ? (
				<Trans>On the default branch</Trans>
			) : flowState.kind === "unavailable" &&
				flowState.reason === "detached-head" ? (
				<Trans>Detached HEAD</Trans>
			) : (
				<Trans>No remote repository</Trans>
			);
		case "error":
			return <Trans>Could not load the repository's status</Trans>;
	}
}
