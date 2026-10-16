import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import type { ComponentType } from "react";
import { LuCircleCheck, LuLoaderCircle, LuTriangleAlert } from "react-icons/lu";
import type { CardBlockViewProps } from "../../types";
import { ActionButton } from "../ActionButton";
import { GithubCommitList } from "../GithubCommitList";
import { GithubPullHeader } from "../GithubPullHeader";
import { StartAgentAction, type StartAgentProps } from "../StartAgentAction";
import { UpdateBranchButton } from "./components/UpdateBranchButton";

interface GithubBranchBlockProps extends CardBlockViewProps<"github.branch"> {
	StartAgent: ComponentType<StartAgentProps>;
}

/** A pull request branch against its base, in the words of GitHub's merge box: out of date, in conflict, or current, with the ways to bring it up to date. */
export function GithubBranchBlock({
	view,
	actions,
	done,
	pending,
	failure,
	onAct,
	StartAgent,
}: GithubBranchBlockProps) {
	const { t } = useLingui();
	const { pull, state } = view;
	const action = (id: string) => actions.find((entry) => entry.id === id);
	const base = pull.base;

	return (
		<div className="flex flex-col">
			<GithubPullHeader pull={pull} />
			<div
				data-state={state}
				className="flex flex-col gap-2.5 border-t border-border px-4 py-3"
			>
				<div className="flex min-w-0 items-start gap-2 text-[13px]">
					{state === "current" ? (
						<LuCircleCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
					) : state === "computing" ? (
						<LuLoaderCircle className="mt-0.5 size-3.5 shrink-0 animate-spin text-muted-foreground" />
					) : (
						<LuTriangleAlert
							className={cn(
								"mt-0.5 size-3.5 shrink-0",
								state === "conflicts" ? "text-destructive" : "text-amber-500",
							)}
						/>
					)}
					<div className="flex min-w-0 flex-col gap-0.5">
						<span className="font-medium text-foreground">
							{state === "behind" ? (
								<Trans>This branch is out-of-date with the base branch</Trans>
							) : state === "conflicts" ? (
								<Trans>This branch has conflicts that must be resolved</Trans>
							) : state === "computing" ? (
								<Trans>Checking for the ability to merge</Trans>
							) : (
								<Trans>This branch is up to date</Trans>
							)}
						</span>
						{view.behindBy > 0 && (
							<span className="text-xs text-muted-foreground">
								{t({
									message: plural(view.behindBy, {
										one: `# commit behind ${base}`,
										other: `# commits behind ${base}`,
									}),
								})}
							</span>
						)}
					</div>
				</div>
				<GithubCommitList commits={view.missing} total={view.behindBy} />
			</div>
			{failure && (
				<p
					role="alert"
					className="border-t border-border px-4 py-3 text-xs text-destructive"
				>
					{failure}
				</p>
			)}
			{!done && (
				<div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">
					<ActionButton
						action={action("dismiss")}
						pending={pending}
						variant="ghost"
						onClick={() => onAct("dismiss")}
					>
						{action("dismiss")?.label}
					</ActionButton>
					<StartAgentAction
						action={action("started")}
						id={`${pull.repo}#${pull.number}`}
						fix={view.fix}
						pending={pending}
						StartAgent={StartAgent}
						onStarted={(workspace) => onAct("started", { workspace })}
					/>
					<UpdateBranchButton
						action={action("update")}
						pending={pending}
						plan={view.plan}
						onUpdate={(method) => onAct("update", { method, sha: pull.sha })}
					/>
				</div>
			)}
		</div>
	);
}
