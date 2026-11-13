import { Trans, useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { LuChevronRight } from "react-icons/lu";
import { VscLoading } from "react-icons/vsc";
import { usePullRequestLinkPolicy } from "renderer/lib/clickPolicy";
import {
	type OpenPullRequestPane,
	openPullRequestLink,
} from "renderer/lib/github/openPullRequestLink";
import type { RepositoryShipSnapshot } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useRepositoryShipSnapshots";
import { useShipActions } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useShipActions";
import { PRIcon } from "renderer/screens/main/components/PRIcon";
import { pullRequestLinkState } from "../../utils/pullRequestLinkState";
import { RepositoryShipStatus } from "../RepositoryShipStatus";

interface RepositoryShipRowProps {
	workspaceId: string;
	repository: { repositoryId: string; name: string };
	snapshot: RepositoryShipSnapshot | undefined;
	onOpen: () => void;
	onOpenPullRequest: OpenPullRequestPane;
}

const PENDING_DOT = "size-2 rounded-full bg-amber-400";

export function RepositoryShipRow({
	workspaceId,
	repository,
	snapshot,
	onOpen,
	onOpenPullRequest,
}: RepositoryShipRowProps) {
	const { t } = useLingui();
	const linkPolicy = usePullRequestLinkPolicy();
	const actions = useShipActions({
		workspaceId,
		repositoryId: repository.repositoryId,
		onRefresh: () => {},
		isPrFormOpen: false,
		onCommitted: () => {},
		onPrCreated: () => {},
		enabled: false,
	});
	const repositoryName = repository.name;
	const step = snapshot?.step ?? "loading";
	const pr = snapshot?.pr ?? null;

	const actionButtonClass =
		"shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors hover:bg-accent disabled:opacity-50";

	return (
		<div className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50">
			<button
				type="button"
				onClick={onOpen}
				aria-label={t({ message: `Details for ${repositoryName}` })}
				className="flex min-w-0 flex-1 items-center gap-2.5 text-left outline-none"
			>
				<span className="flex size-4 shrink-0 items-center justify-center">
					{pr ? (
						<PRIcon state={pullRequestLinkState(pr)} className="size-3.5" />
					) : step === "commit" || step === "create-pr" ? (
						<span className={PENDING_DOT} />
					) : step === "error" ? (
						<span className="size-2 rounded-full bg-destructive" />
					) : (
						<span className="size-2 rounded-full bg-muted-foreground/40" />
					)}
				</span>
				<span className="flex min-w-0 flex-col">
					<span className="truncate font-mono text-xs">{repository.name}</span>
					<span className="truncate text-[11px] text-muted-foreground">
						<RepositoryShipStatus snapshot={snapshot} />
					</span>
				</span>
			</button>
			{step === "commit" ? (
				<button
					type="button"
					onClick={onOpen}
					className={cn(
						actionButtonClass,
						"bg-foreground text-background hover:bg-foreground/90",
					)}
				>
					<Trans>Commit</Trans>
				</button>
			) : step === "create-pr" ? (
				<button type="button" onClick={onOpen} className={actionButtonClass}>
					<Trans>Create PR</Trans>
				</button>
			) : step === "push" ? (
				<button
					type="button"
					onClick={actions.push}
					disabled={actions.isPushing}
					className={actionButtonClass}
				>
					{actions.isPushing ? (
						<VscLoading className="size-3 animate-spin" />
					) : (
						<Trans>Push</Trans>
					)}
				</button>
			) : step === "pull-request" && pr ? (
				<button
					type="button"
					onClick={(event) =>
						openPullRequestLink(
							pr.url,
							linkPolicy.getAction(event),
							onOpenPullRequest,
						)
					}
					className={cn(
						actionButtonClass,
						"border-transparent text-muted-foreground",
					)}
				>
					<Trans>View</Trans>
				</button>
			) : null}
			<LuChevronRight
				aria-hidden
				className="size-3.5 shrink-0 text-muted-foreground/60"
			/>
		</div>
	);
}
