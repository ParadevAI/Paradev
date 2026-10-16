import { useLingui } from "@lingui/react/macro";
import { Textarea } from "@superset/ui/textarea";
import { useState } from "react";
import { LuExternalLink } from "react-icons/lu";
import type { CardBlockViewProps, GithubDeploymentView } from "../../types";
import { fillClause } from "../../utils/handoffPlan";
import { ActionButton } from "../ActionButton";
import { GithubAvatar } from "../GithubAvatar";
import { EnvironmentRow } from "./components/EnvironmentRow";

const COMMENT_MAX = 500;

const approvable = (view: GithubDeploymentView) =>
	view.environments.filter((each) => each.canApprove).map((each) => each.id);

/** GitHub's "Review pending deployments" dialog: the run, the environments it waits on, a comment, and Reject or Approve and deploy. */
export function GithubDeploymentBlock({
	view,
	actions,
	done,
	pending,
	failure,
	onAct,
}: CardBlockViewProps<"github.deployment">) {
	const { t } = useLingui();
	const { run, environments } = view;
	const [checked, setChecked] = useState(() => approvable(view));
	const [comment, setComment] = useState("");

	const action = (id: string) => actions.find((entry) => entry.id === id);
	const picked = environments.filter(
		(each) => each.canApprove && checked.includes(each.id),
	);
	const input = {
		environments: picked.map((each) => each.id),
		comment: comment.trim(),
	};
	const names = picked.map((each) => each.name).join(", ");
	const review = (id: "approve" | "reject") => ({
		action: action(id),
		pending,
		disabled: picked.length === 0,
		confirmText: fillClause(view.plan[id], { environments: names }),
		onClick: () => onAct(id, input),
		children: action(id)?.label,
	});

	return (
		<div className="flex flex-col">
			<div className="flex flex-col gap-1.5 px-4 py-3">
				<a
					href={run.url}
					target="_blank"
					rel="noreferrer"
					className="inline-flex min-w-0 items-center gap-1 self-start text-sm font-medium text-foreground hover:underline"
				>
					<span className="truncate">{run.title}</span>
					<LuExternalLink className="size-3 shrink-0 opacity-60" />
				</a>
				<div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
					<span>{run.name}</span>
					{run.branch && (
						<span className="min-w-0 truncate font-mono text-[11.5px]">
							{run.branch}
						</span>
					)}
					{run.actor && (
						<span className="inline-flex items-center gap-1.5">
							<GithubAvatar
								name={run.actor.login}
								avatarUrl={run.actor.avatarUrl}
							/>
							{run.actor.login}
						</span>
					)}
					<span className="ml-auto shrink-0">{view.repo}</span>
				</div>
			</div>
			{environments.length > 0 && (
				<div className="flex flex-col gap-3 border-t border-border px-4 py-3">
					<ul className="flex max-h-64 flex-col divide-y divide-border overflow-y-auto rounded-md border border-border">
						{environments.map((environment) => (
							<EnvironmentRow
								key={environment.id}
								environment={environment}
								checked={picked.includes(environment)}
								disabled={done || pending}
								onCheck={(on) =>
									setChecked((ids) =>
										on
											? [...ids, environment.id]
											: ids.filter((id) => id !== environment.id),
									)
								}
							/>
						))}
					</ul>
					{!done && (
						<Textarea
							value={comment}
							onChange={(event) => setComment(event.target.value)}
							maxLength={COMMENT_MAX}
							disabled={pending}
							placeholder={t({ message: "Leave a comment" })}
							aria-label={t({ message: "Leave a comment" })}
							className="min-h-16 text-[13px]"
						/>
					)}
				</div>
			)}
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
					<ActionButton {...review("reject")} variant="destructive" />
					<ActionButton {...review("approve")} />
				</div>
			)}
		</div>
	);
}
