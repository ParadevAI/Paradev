import { Trans, useLingui } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Ellipsis } from "lucide-react";
import { useRef, useState } from "react";
import {
	VscGitCommit,
	VscGitMerge,
	VscGitPullRequest,
	VscGitPullRequestCreate,
	VscRepoPush,
} from "react-icons/vsc";
import type { PullRequestMergeMethod } from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/pullRequestClient";

export type ShipView = "commit" | "pr";

export interface PullRequestMenuActions {
	canMarkReady: boolean;
	canMerge: boolean;
	isMarkingReady: boolean;
	isMerging: boolean;
	onMarkReady: () => void;
	onMerge: (method: PullRequestMergeMethod) => void;
}

const MENU_WIDTH = 224;
const MENU_GAP = 8;

interface MenuPlacement {
	side: "left" | "bottom";
	offset: number;
}

export function ShipActionsMenu({
	canCommit,
	canPush,
	canCreatePr,
	hasCommitsAhead,
	isBusy,
	onOpenView,
	onPush,
	onNoCommitsAhead,
	pullRequest,
}: {
	canCommit: boolean;
	canPush: boolean;
	canCreatePr: boolean;
	hasCommitsAhead: boolean;
	isBusy: boolean;
	onOpenView: (view: ShipView) => void;
	onPush: () => void;
	onNoCommitsAhead: () => void;
	pullRequest?: PullRequestMenuActions;
}) {
	const { t } = useLingui();
	// Opening a form from a menu item has to wait for the menu's focus scope
	// to close, or the menu takes focus back from the form's autofocused field.
	const pendingViewRef = useRef<ShipView | null>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const [placement, setPlacement] = useState<MenuPlacement>({
		side: "bottom",
		offset: 4,
	});
	const hasShipActions = canCommit || canPush || canCreatePr;
	const hasPullRequestActions =
		pullRequest !== undefined &&
		(pullRequest.canMarkReady || pullRequest.canMerge);
	if (!hasShipActions && !hasPullRequestActions) return null;

	return (
		<DropdownMenu
			onOpenChange={(open) => {
				const trigger = triggerRef.current;
				const panel = trigger?.closest("[data-activity-panel]");
				if (!open || !trigger || !panel) return;
				const panelLeft = panel.getBoundingClientRect().left;
				setPlacement(
					panelLeft >= MENU_WIDTH + MENU_GAP * 2
						? {
								side: "left",
								offset:
									trigger.getBoundingClientRect().left - panelLeft + MENU_GAP,
							}
						: { side: "bottom", offset: 4 },
				);
			}}
		>
			<DropdownMenuTrigger asChild>
				<button
					ref={triggerRef}
					type="button"
					aria-label={t({ message: "More actions" })}
					className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent data-[state=open]:bg-accent data-[state=open]:text-foreground"
				>
					<Ellipsis className="size-4" strokeWidth={1.5} />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				side={placement.side}
				align={placement.side === "left" ? "start" : "end"}
				sideOffset={placement.offset}
				className="w-56"
				onCloseAutoFocus={(event) => {
					const pending = pendingViewRef.current;
					if (!pending) return;
					pendingViewRef.current = null;
					event.preventDefault();
					onOpenView(pending);
				}}
			>
				{canCommit && (
					<DropdownMenuItem
						disabled={isBusy}
						onClick={() => {
							pendingViewRef.current = "commit";
						}}
					>
						<VscGitCommit className="size-4" />
						<Trans>Commit</Trans>
					</DropdownMenuItem>
				)}
				{canPush && (
					<DropdownMenuItem disabled={isBusy} onClick={onPush}>
						<VscRepoPush className="size-4" />
						<Trans>Push</Trans>
					</DropdownMenuItem>
				)}
				{canCreatePr && (
					<DropdownMenuItem
						disabled={isBusy}
						className={
							hasCommitsAhead
								? undefined
								: "text-muted-foreground focus:text-muted-foreground"
						}
						onClick={() => {
							if (!hasCommitsAhead) {
								onNoCommitsAhead();
								return;
							}
							pendingViewRef.current = "pr";
						}}
					>
						<VscGitPullRequestCreate className="size-4" />
						<Trans>Create PR</Trans>
					</DropdownMenuItem>
				)}
				{pullRequest && hasPullRequestActions && (
					<>
						{hasShipActions && <DropdownMenuSeparator />}
						{pullRequest.canMarkReady && (
							<DropdownMenuItem
								disabled={pullRequest.isMarkingReady}
								onClick={pullRequest.onMarkReady}
							>
								<VscGitPullRequest className="size-4" />
								<Trans>Ready for review</Trans>
							</DropdownMenuItem>
						)}
						{pullRequest.canMerge && (
							<>
								<DropdownMenuLabel className="font-normal text-muted-foreground">
									<Trans>Merge</Trans>
								</DropdownMenuLabel>
								<DropdownMenuItem
									disabled={pullRequest.isMerging}
									onClick={() => pullRequest.onMerge("squash")}
								>
									<VscGitMerge className="size-4" />
									<Trans>Squash and merge</Trans>
								</DropdownMenuItem>
								<DropdownMenuItem
									disabled={pullRequest.isMerging}
									onClick={() => pullRequest.onMerge("merge")}
								>
									<VscGitMerge className="size-4" />
									<Trans>Create merge commit</Trans>
								</DropdownMenuItem>
								<DropdownMenuItem
									disabled={pullRequest.isMerging}
									onClick={() => pullRequest.onMerge("rebase")}
								>
									<VscGitMerge className="size-4" />
									<Trans>Rebase and merge</Trans>
								</DropdownMenuItem>
							</>
						)}
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
