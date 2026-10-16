import { Trans, useLingui } from "@lingui/react/macro";
import { formatDate } from "@superset/i18n/format";
import { Button } from "@superset/ui/button";
import { LuCloud, LuMonitor } from "react-icons/lu";
import { runErrorHelp } from "renderer/routes/_authenticated/_dashboard/automations/utils/runErrorHelp";
import { RUN_STATUS_META } from "renderer/routes/_authenticated/_dashboard/automations/utils/runStatus";
import type { CardBlockViewProps } from "../../types";
import { CardActions } from "../CardActions";
import { RunStatusDot } from "./components/RunStatusDot";
import { useOpenRun } from "./hooks/useOpenRun";

type RunStatus = keyof typeof RUN_STATUS_META;

/** A run that failed or never started, with the host's own error, the runs list's guidance for it, and whether later runs got through. */
export function AutomationFailedBlock({
	view,
	actions,
	done,
	pending,
	failure,
	onAct,
}: CardBlockViewProps<"superset.automation_failed">) {
	const { i18n } = useLingui();
	const openRun = useOpenRun(view.automation.id);
	const { automation, run } = view;
	const help = runErrorHelp(run.errorCode);
	const meta = RUN_STATUS_META[run.status as RunStatus];
	return (
		<div className="flex flex-col">
			<div className="flex flex-col gap-2.5 px-4 py-3 text-[13px]">
				<div className="flex items-center gap-2">
					<RunStatusDot status={run.status} />
					<span className="font-medium text-foreground">
						{run.title ?? automation.name}
					</span>
					{meta && (
						<span className="text-muted-foreground">{i18n._(meta.label)}</span>
					)}
					<span className="ml-auto flex items-center gap-1.5 text-[12px] text-muted-foreground">
						{automation.target.kind === "cloud" ? (
							<LuCloud className="size-3.5" />
						) : (
							<LuMonitor className="size-3.5" />
						)}
						{automation.target.kind === "cloud" ? (
							<Trans>Cloud</Trans>
						) : (
							(automation.target.name ?? <Trans>A device</Trans>)
						)}
						<span>·</span>
						{formatDate(new Date(run.scheduledFor ?? run.createdAt), {
							dateStyle: "medium",
							timeStyle: "short",
						})}
					</span>
				</div>
				{run.error && (
					<pre className="whitespace-pre-wrap break-words rounded-md bg-destructive/10 px-3 py-2 font-mono text-[12px] text-destructive">
						{run.error}
					</pre>
				)}
				{help && <p className="text-muted-foreground">{i18n._(help)}</p>}
				{view.later.length > 0 && (
					<div className="flex flex-wrap items-center gap-3 text-[12px] text-muted-foreground">
						<Trans>Since then</Trans>
						{view.later.map((later) => {
							const laterMeta = RUN_STATUS_META[later.status as RunStatus];
							return (
								<button
									key={later.id}
									type="button"
									disabled={!later.session}
									onClick={() => openRun(later.session)}
									className="flex items-center gap-1.5 enabled:hover:text-foreground enabled:hover:underline"
								>
									<RunStatusDot status={later.status} />
									{laterMeta ? i18n._(laterMeta.label) : later.status}
								</button>
							);
						})}
					</div>
				)}
			</div>
			{!done && (
				<CardActions
					actions={actions}
					pending={pending}
					failure={failure}
					onAct={onAct}
					leading={
						<Button
							type="button"
							size="sm"
							variant="ghost"
							onClick={() => openRun(run.session)}
						>
							<Trans>Open run</Trans>
						</Button>
					}
				/>
			)}
		</div>
	);
}
