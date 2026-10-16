import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { formatNumber } from "@superset/i18n/format";
import type { ComponentType } from "react";
import { LuCircleX, LuExternalLink, LuLoaderCircle } from "react-icons/lu";
import type { CardBlockViewProps } from "../../types";
import { ActionButton } from "../ActionButton";
import { GithubPullHeader } from "../GithubPullHeader";
import { StartAgentAction, type StartAgentProps } from "../StartAgentAction";
import { FailedJob } from "./components/FailedJob";

interface GithubCiFailedBlockProps
	extends CardBlockViewProps<"github.ci_failed"> {
	StartAgent: ComponentType<StartAgentProps>;
}

/** The checks that failed on a pull request, with the step and log of each failed job, and the ways on: re-run them, or start an agent on the fix. */
export function GithubCiFailedBlock({
	view,
	actions,
	done,
	pending,
	failure,
	onAct,
	StartAgent,
}: GithubCiFailedBlockProps) {
	const { t } = useLingui();
	const { pull } = view;
	const action = (id: string) => actions.find((entry) => entry.id === id);
	const failing = formatNumber(view.failing);
	const running = formatNumber(view.pending);
	const rerunFailed = action("rerun_failed");
	const rerunAll = action("rerun_all");

	return (
		<div className="flex flex-col">
			<GithubPullHeader pull={pull} />
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-4 py-2.5 text-xs">
				<span className="font-medium text-foreground">
					{t({
						message: plural(view.total, {
							one: `${failing} of # check failing`,
							other: `${failing} of # checks failing`,
						}),
					})}
				</span>
				{view.omitted > 0 && (
					<span data-omitted className="text-muted-foreground">
						{t({
							message: plural(view.omitted, {
								one: "and # more failed job",
								other: "and # more failed jobs",
							}),
						})}
					</span>
				)}
				{view.pending > 0 && (
					<span className="text-muted-foreground">
						{t({ message: `${running} still running` })}
					</span>
				)}
			</div>
			{view.runs.map((run) => {
				const attempt = formatNumber(run.attempt);
				return (
					<div
						key={run.id}
						data-run={run.id}
						className="flex min-w-0 flex-col gap-3 border-t border-border px-4 py-3"
					>
						<div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
							<a
								href={run.url}
								target="_blank"
								rel="noreferrer"
								className="min-w-0 truncate font-medium text-foreground hover:underline"
							>
								{run.name}
							</a>
							<span className="shrink-0">
								<Trans>Attempt {attempt}</Trans>
							</span>
							{run.running && (
								<span className="inline-flex shrink-0 items-center gap-1">
									<LuLoaderCircle className="size-3 animate-spin" />
									<Trans>Running</Trans>
								</span>
							)}
						</div>
						{run.jobs.map((job) => (
							<FailedJob key={job.id} job={job} />
						))}
					</div>
				);
			})}
			{view.others.length > 0 && (
				<ul className="flex flex-col gap-1.5 border-t border-border px-4 py-3 text-[13px]">
					{view.others.map((check) => (
						<li
							key={check.name}
							data-check={check.name}
							className="flex min-w-0 items-center gap-2"
						>
							<LuCircleX className="size-3.5 shrink-0 text-destructive" />
							{check.url ? (
								<a
									href={check.url}
									target="_blank"
									rel="noreferrer"
									className="inline-flex min-w-0 items-center gap-1 text-foreground hover:underline"
								>
									<span className="truncate">{check.name}</span>
									<LuExternalLink className="size-3 shrink-0 opacity-60" />
								</a>
							) : (
								<span className="min-w-0 truncate text-foreground">
									{check.name}
								</span>
							)}
						</li>
					))}
				</ul>
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
					<StartAgentAction
						action={action("started")}
						id={`${pull.repo}#${pull.number}`}
						fix={view.fix}
						pending={pending}
						StartAgent={StartAgent}
						onStarted={(workspace) => onAct("started", { workspace })}
					/>
					<ActionButton
						action={rerunAll}
						pending={pending}
						variant="outline"
						onClick={() => onAct("rerun_all", { sha: pull.sha })}
					>
						{rerunAll?.label}
					</ActionButton>
					<ActionButton
						action={rerunFailed}
						pending={pending}
						onClick={() => onAct("rerun_failed", { sha: pull.sha })}
					>
						{rerunFailed?.label}
					</ActionButton>
				</div>
			)}
		</div>
	);
}
