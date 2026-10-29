import type { MouseEvent, ReactNode } from "react";
import { PRIcon, type PRState } from "renderer/screens/main/components/PRIcon";
import { PRStatusIndicators } from "../../../PRStatusIndicators";
import {
	pullRequestDisplayState,
	showsChecks,
} from "../../utils/pullRequestDisplayState";

export type PullRequestEntry = {
	repoOwner: string;
	repoName: string;
	number: number;
	url: string;
	title: string;
	state: PRState;
	isDraft: boolean;
	headBranch: string;
	checksStatus: "success" | "failure" | "pending" | "none";
};

export function PullRequestRow({
	pullRequest,
	menu,
	onOpen,
}: {
	pullRequest: PullRequestEntry;
	menu?: ReactNode;
	onOpen: (pullRequest: PullRequestEntry, event: MouseEvent) => void;
}) {
	const state = pullRequestDisplayState(pullRequest);
	return (
		<div className="flex min-h-7 items-center gap-1 rounded-sm pr-1 transition-colors hover:bg-accent">
			<button
				type="button"
				onClick={(event) => onOpen(pullRequest, event)}
				className="flex min-h-7 min-w-0 flex-1 items-center gap-2 rounded-sm py-0.5 pr-1 pl-2 text-left text-xs outline-none focus-visible:bg-accent"
			>
				<PRIcon state={state} className="size-3.5 shrink-0" />
				<span className="flex min-w-0 flex-1 flex-col">
					<span className="flex min-w-0 items-center gap-1.5">
						<span className="shrink-0 text-muted-foreground tabular-nums">
							#{pullRequest.number}
						</span>
						<span className="min-w-0 truncate text-foreground">
							{pullRequest.title}
						</span>
					</span>
					<span className="min-w-0 truncate text-[11px] text-muted-foreground/70">
						{pullRequest.repoOwner}/{pullRequest.repoName} ·{" "}
						{pullRequest.headBranch}
					</span>
				</span>
				{showsChecks(state) && (
					<PRStatusIndicators checks={{ overall: pullRequest.checksStatus }} />
				)}
			</button>
			{menu}
		</div>
	);
}
