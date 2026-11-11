import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { LuArrowUpRight, LuChevronLeft, LuFolderGit2 } from "react-icons/lu";
import { VscGitPullRequest, VscLoading, VscRepoPush } from "react-icons/vsc";
import { usePullRequestLinkPolicy } from "renderer/lib/clickPolicy";
import {
	type OpenPullRequestPane,
	openPullRequestLink,
} from "renderer/lib/github/openPullRequestLink";
import { ChangesStats } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/ChangesStats";
import { CommitForm } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/CommitForm";
import { CreatePrForm } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/CreatePrForm";
import type { RepositoryShipSnapshot } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useRepositoryShipSnapshots";
import { useShipActions } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useShipActions";
import { PRIcon } from "renderer/screens/main/components/PRIcon";
import { pullRequestLinkState } from "../../utils/pullRequestLinkState";
import { RepositoryShipStatus } from "../RepositoryShipStatus";

interface RepositoryShipDetailProps {
	workspaceId: string;
	repository: { id: string; name: string };
	snapshot: RepositoryShipSnapshot | undefined;
	onBack: () => void;
	onOpenPullRequest: OpenPullRequestPane;
}

/** One repository's ship state and actions, slid over the repository list. */
export function RepositoryShipDetail({
	workspaceId,
	repository,
	snapshot,
	onBack,
	onOpenPullRequest,
}: RepositoryShipDetailProps) {
	const { t } = useLingui();
	const linkPolicy = usePullRequestLinkPolicy();
	const step = snapshot?.step ?? "loading";
	const sync = snapshot?.sync ?? null;
	const pr = snapshot?.pr ?? null;
	const stats = snapshot?.stats ?? null;
	const showCreatePr = step === "create-pr";
	const actions = useShipActions({
		workspaceId: repository.id,
		paneWorkspaceId: workspaceId,
		onRefresh: () => {},
		isPrFormOpen: showCreatePr,
		onCommitted: () => {},
		onPrCreated: () => {},
	});
	const needsPush = sync != null && (!sync.hasUpstream || sync.pushCount > 0);
	const pushCount = sync?.pushCount ?? 0;
	const pullCount = sync?.pullCount ?? 0;
	const fileCount = stats?.fileCount ?? 0;

	return (
		<div className="flex flex-col">
			<div className="flex items-center gap-1.5 border-b px-1.5 py-1.5">
				<button
					type="button"
					onClick={onBack}
					aria-label={t({ message: "Back to repositories" })}
					className="rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
				>
					<LuChevronLeft className="size-4" />
				</button>
				<LuFolderGit2 className="size-3.5 shrink-0 text-muted-foreground" />
				<span className="shrink-0 font-mono text-xs font-medium">
					{repository.name}
				</span>
				{sync?.currentBranch && (
					<span className="ml-auto min-w-0 truncate pr-1.5 font-mono text-[11px] text-muted-foreground">
						{sync.currentBranch}
					</span>
				)}
			</div>

			<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 px-3 py-2.5 text-xs">
				<dt className="text-muted-foreground">
					<Trans>Changes</Trans>
				</dt>
				<dd className="flex items-center gap-1.5">
					{fileCount > 0 && stats ? (
						<>
							<Plural
								value={fileCount}
								one="# file changed"
								other="# files changed"
							/>
							<ChangesStats stats={stats} />
						</>
					) : (
						<Trans>No uncommitted changes</Trans>
					)}
				</dd>
				<dt className="text-muted-foreground">
					<Trans>Remote</Trans>
				</dt>
				<dd>
					{sync == null ? (
						<RepositoryShipStatus snapshot={snapshot} />
					) : !sync.hasUpstream ? (
						<Trans>Branch not published</Trans>
					) : pushCount > 0 || pullCount > 0 ? (
						<span className="flex gap-2">
							{pushCount > 0 && (
								<Plural
									value={pushCount}
									one="# commit not pushed"
									other="# commits not pushed"
								/>
							)}
							{pullCount > 0 && (
								<Plural
									value={pullCount}
									one="# commit to pull"
									other="# commits to pull"
								/>
							)}
						</span>
					) : (
						<Trans>Up to date</Trans>
					)}
				</dd>
			</dl>

			{pr && (
				<div className="mx-3 mb-2.5 rounded-md border px-2.5 py-2">
					<div className="flex items-center gap-1.5 text-xs">
						<PRIcon state={pullRequestLinkState(pr)} className="size-3.5" />
						<span className="font-mono text-muted-foreground">
							#{pr.number}
						</span>
						<span className="truncate">{pr.title}</span>
					</div>
					<div className="mt-2 flex gap-1.5">
						<Button
							size="sm"
							variant="outline"
							className="h-7 text-xs"
							onClick={(event) =>
								openPullRequestLink(
									pr.url,
									linkPolicy.getAction(event),
									onOpenPullRequest,
								)
							}
						>
							<VscGitPullRequest className="size-3.5" />
							<Trans>Open pull request</Trans>
						</Button>
						<Button size="sm" variant="ghost" className="h-7 text-xs" asChild>
							<a href={pr.url} target="_blank" rel="noopener noreferrer">
								<LuArrowUpRight className="size-3.5" />
								<Trans>View on GitHub</Trans>
							</a>
						</Button>
					</div>
				</div>
			)}

			{step !== "pull-request" && (
				<div className="border-t px-3 py-2.5">
					{step === "commit" ? (
						<CommitForm actions={actions} />
					) : showCreatePr ? (
						<CreatePrForm actions={actions} />
					) : needsPush ? (
						<Button
							size="sm"
							className="h-7 w-full text-xs"
							disabled={actions.isPushing}
							onClick={actions.push}
						>
							{actions.isPushing ? (
								<VscLoading className="size-3.5 animate-spin" />
							) : (
								<VscRepoPush className="size-3.5" />
							)}
							<Trans>Push</Trans>
						</Button>
					) : (
						<p className="text-xs text-muted-foreground">
							<RepositoryShipStatus snapshot={snapshot} />
						</p>
					)}
				</div>
			)}
		</div>
	);
}
