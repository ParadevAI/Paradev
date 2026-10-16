import { DashboardSidebarWorkspaceDiffStats } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarWorkspaceItem/components/DashboardSidebarWorkspaceDiffStats";
import { PullRequestStatusBadge } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarWorkspaceItem/components/DashboardSidebarWorkspaceHoverCardContent/components/PullRequestStatusBadge";
import { PullRequestCommentThread } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestCodeTab/components/PullRequestCommentThread";
import type { CardBlockViewProps } from "../../types";
import { CardActions } from "../CardActions";
import { SupersetWorkspace } from "../SupersetWorkspace";

/** Review comments on an agent's PR, drawn with the PR page's own threads; replies and resolves go to GitHub as the reader. */
export function PrReviewBlock({
	view,
	actions,
	done,
	pending,
	failure,
	onAct,
}: CardBlockViewProps<"superset.pr_review">) {
	const pr = view.pullRequest;
	const address = actions.filter((action) => action.id === "address");
	return (
		<div className="flex flex-col">
			<SupersetWorkspace workspace={view.workspace} />
			<div className="flex flex-col gap-3 border-t border-border px-4 py-3">
				<div className="flex min-w-0 items-center gap-2 text-[13px]">
					<PullRequestStatusBadge
						state={pr.isDraft && pr.state === "open" ? "draft" : pr.state}
					/>
					<a
						href={pr.url}
						target="_blank"
						rel="noreferrer"
						className="shrink-0 text-muted-foreground hover:text-foreground hover:underline"
					>
						#{pr.number}
					</a>
					<span className="min-w-0 truncate font-medium text-foreground">
						{pr.title}
					</span>
					{pr.additions !== null && pr.deletions !== null && (
						<DashboardSidebarWorkspaceDiffStats
							additions={pr.additions}
							deletions={pr.deletions}
						/>
					)}
				</div>
				{view.threads.map((thread) => (
					<div
						key={thread.id}
						inert={done}
						className="overflow-hidden rounded-md border border-border"
					>
						<div className="truncate border-b border-border bg-muted/40 px-3 py-1.5 font-mono text-[11.5px] text-muted-foreground">
							{thread.path}
							{thread.line ? `:${thread.line}` : ""}
						</div>
						<PullRequestCommentThread
							isResolved={false}
							isOutdated={thread.outdated}
							url={thread.comments[0]?.url}
							comments={thread.comments.map((comment) => ({
								id: comment.id,
								authorLogin: comment.author.login,
								avatarUrl: comment.author.avatarUrl ?? undefined,
								body: comment.body,
								createdAt: new Date(comment.createdAt).getTime(),
							}))}
							onResolveChange={(resolved) =>
								onAct("resolve", { thread: thread.id, resolved })
							}
							isResolvePending={pending}
							onReply={(body) => {
								onAct("reply", { thread: thread.id, body });
								return true;
							}}
							isReplyPending={pending}
						/>
					</div>
				))}
			</div>
			{!done && address.length > 0 && (
				<CardActions
					actions={address}
					pending={pending}
					failure={failure}
					onAct={onAct}
				/>
			)}
		</div>
	);
}
