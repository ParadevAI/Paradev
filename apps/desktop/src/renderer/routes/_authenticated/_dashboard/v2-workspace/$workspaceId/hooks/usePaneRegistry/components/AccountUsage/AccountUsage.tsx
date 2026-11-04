import { Trans, useLingui } from "@lingui/react/macro";
import { formatDate, formatPercent } from "@superset/i18n/format";
import { AGENT_IDENTITY_LABELS } from "@superset/shared/agent-catalog";
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { formatResetLabel } from "renderer/utils/usage/formatResetIn";
import { useAccountUsage } from "../../hooks/useAccountUsage";

interface AccountUsageProps {
	workspaceId: string;
	terminalId: string;
}

export function AccountUsage({ workspaceId, terminalId }: AccountUsageProps) {
	const { t } = useLingui();
	const { account, binding, now, state, status } = useAccountUsage(
		workspaceId,
		terminalId,
	);
	if (!binding) return null;
	return (
		<>
			<DropdownMenuSeparator />
			<section
				aria-label={t({ message: "Account usage" })}
				className="px-2 py-1.5"
				data-testid="pane-account-usage"
			>
				<div className="flex items-baseline justify-between gap-3">
					<h2 className="text-xs text-muted-foreground">
						<Trans>Account usage</Trans>
					</h2>
					<span className="min-w-0 truncate text-[11px] text-muted-foreground">
						{account?.email ?? AGENT_IDENTITY_LABELS[binding.agentId]}
						{account?.plan && ` · ${account.plan}`}
					</span>
				</div>
				{status && <p className="mt-2 text-xs">{status}</p>}
				{(state === "ready" || state === "stale") &&
					account?.windows.map((window) => {
						const used = formatPercent(window.usedPercent / 100);
						return (
							<div key={window.id} className="mt-3">
								<div className="flex justify-between gap-3 text-xs">
									<span>{window.label}</span>
									<span className="shrink-0 tabular-nums">
										<Trans>{used} used</Trans>
									</span>
								</div>
								<div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
									<div
										className={cn(
											"h-full rounded-full",
											state === "stale"
												? "bg-muted-foreground"
												: window.usedPercent >= 90
													? "bg-red-500"
													: window.usedPercent >= 70
														? "bg-amber-500"
														: "bg-primary",
										)}
										style={{
											width: `${Math.min(100, Math.max(0, window.usedPercent))}%`,
										}}
									/>
								</div>
								<p className="mt-1 text-[11px] text-muted-foreground">
									{window.resetsAt &&
									new Date(window.resetsAt).getTime() > now.getTime() ? (
										formatResetLabel(new Date(window.resetsAt), now)
									) : (
										<Trans>Reset time unavailable</Trans>
									)}
								</p>
							</div>
						);
					})}
				{account?.credentialKind === "subscription" && (
					<p className="mt-2 text-[11px] text-muted-foreground">
						<Trans>Shared across sessions using this login.</Trans>
					</p>
				)}
				{account && (
					<p className="mt-1 text-[10px] text-muted-foreground">
						{(() => {
							const date = formatDate(new Date(account.fetchedAt), {
								hour: "numeric",
								minute: "2-digit",
							});
							return t({ message: `Updated ${date}` });
						})()}
					</p>
				)}
			</section>
			<DropdownMenuItem asChild>
				<Link
					to="/settings/usage"
					search={{
						workspaceId,
						accountKey: account?.accountKey,
						agent: binding.agentId,
					}}
				>
					<ArrowUpRight />
					<Trans>View usage</Trans>
				</Link>
			</DropdownMenuItem>
		</>
	);
}
