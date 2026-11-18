import { Trans, useLingui } from "@lingui/react/macro";
import type { SessionUsage } from "@superset/chat/protocol";
import { formatPercent } from "@superset/i18n/format";
import type { ReactNode } from "react";
import type { UsageQuotaWindow } from "renderer/hooks/host-service/useHostUsageQuota";
import { formatResetLabel } from "renderer/utils/usage/formatResetIn";
import { contextWindow } from "../../../../utils/contextWindow";

export type WorkspaceKind = "local" | "worktree" | "cloud";

export type SessionStatusContentProps = {
	agent?: string;
	model?: string;
	effort?: string;
	fast?: boolean;
	mode?: string;
	workspace?: WorkspaceKind;
	branch?: string;
	usage: SessionUsage | null;
	limits: {
		windows: UsageQuotaWindow[];
		status: string | null;
		now: Date;
	};
};

const SECTION_CLASS = "rounded-lg border border-border/60 p-3";
const SECTION_TITLE_CLASS = "mb-2 text-muted-foreground text-xs";
const LABEL_CLASS = "text-muted-foreground text-xs";
const VALUE_CLASS = "truncate font-medium text-sm tabular-nums";

export function SessionStatusContent({
	agent,
	model,
	effort,
	fast,
	mode,
	workspace,
	branch,
	usage,
	limits,
}: SessionStatusContentProps) {
	const { t } = useLingui();
	const workspaceLabel =
		workspace === "cloud"
			? t({ message: "Cloud" })
			: workspace === "worktree"
				? t({ message: "Worktree" })
				: workspace === "local"
					? t({ message: "Local" })
					: undefined;
	const settings: Array<[string, ReactNode]> = [
		[t({ message: "Agent" }), agent],
		[t({ message: "Model" }), model],
		[t({ message: "Effort" }), effort],
		[
			t({ message: "Fast" }),
			fast === undefined
				? undefined
				: fast
					? t({ message: "On" })
					: t({ message: "Off" }),
		],
		[t({ message: "Mode" }), mode],
		[t({ message: "Workspace" }), workspaceLabel],
		[t({ message: "Branch" }), branch],
	];
	const meter = usage ? contextWindow(usage) : null;
	return (
		<div className="flex flex-col gap-3">
			<dl className={`${SECTION_CLASS} grid grid-cols-2 gap-x-6 gap-y-3`}>
				{settings.map(([label, value]) =>
					value ? (
						<div key={label} className="min-w-0">
							<dt className={LABEL_CLASS}>{label}</dt>
							<dd className={VALUE_CLASS}>{value}</dd>
						</div>
					) : null,
				)}
			</dl>
			<section className={SECTION_CLASS}>
				<h3 className={SECTION_TITLE_CLASS}>
					<Trans>Context window</Trans>
				</h3>
				{meter ? (
					<dl className="grid grid-cols-2 gap-x-6 gap-y-3">
						<div>
							<dt className={LABEL_CLASS}>
								<Trans>Used</Trans>
							</dt>
							<dd className={VALUE_CLASS}>
								{meter.used} · {meter.percent}
							</dd>
						</div>
						<div>
							<dt className={LABEL_CLASS}>
								<Trans>Remaining</Trans>
							</dt>
							<dd className={VALUE_CLASS}>{meter.remaining}</dd>
						</div>
						<div>
							<dt className={LABEL_CLASS}>
								<Trans context="context window size">Window</Trans>
							</dt>
							<dd className={VALUE_CLASS}>{meter.size}</dd>
						</div>
						{meter.cost && (
							<div>
								<dt className={LABEL_CLASS}>
									<Trans>Session cost</Trans>
								</dt>
								<dd className={VALUE_CLASS}>{meter.cost}</dd>
							</div>
						)}
					</dl>
				) : (
					<p className="text-sm">
						<Trans>Not reported yet</Trans>
					</p>
				)}
			</section>
			<section className={SECTION_CLASS}>
				<h3 className={SECTION_TITLE_CLASS}>
					<Trans>Rate limits</Trans>
				</h3>
				{limits.status && limits.windows.length > 0 && (
					<p className="mb-2 text-muted-foreground text-xs">{limits.status}</p>
				)}
				{limits.windows.length > 0 ? (
					<ul className="flex flex-col gap-2">
						{limits.windows.map((quota) => {
							const used = formatPercent(quota.usedPercent / 100, {
								maximumFractionDigits: 0,
							});
							const resetsAt = quota.resetsAt ? new Date(quota.resetsAt) : null;
							return (
								<li
									key={quota.id}
									className="flex items-baseline justify-between gap-3 text-sm"
								>
									<span className="min-w-0 truncate">{quota.label}</span>
									<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
										<Trans>{used} used</Trans>
										{resetsAt && resetsAt.getTime() > limits.now.getTime()
											? ` · ${formatResetLabel(resetsAt, limits.now)}`
											: null}
									</span>
								</li>
							);
						})}
					</ul>
				) : (
					<p className="text-sm">
						{limits.status ?? <Trans>Not reported yet</Trans>}
					</p>
				)}
			</section>
		</div>
	);
}
