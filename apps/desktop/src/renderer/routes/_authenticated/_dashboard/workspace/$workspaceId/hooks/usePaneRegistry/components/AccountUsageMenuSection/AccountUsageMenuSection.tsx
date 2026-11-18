import { useLingui } from "@lingui/react/macro";
import { formatDate, formatPercent } from "@superset/i18n/format";
import { AGENT_IDENTITY_LABELS } from "@superset/shared/agent-catalog";
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import {
	formatResetIn,
	formatResetLabel,
} from "renderer/utils/usage/formatResetIn";
import { useAccountUsage } from "../../hooks/useAccountUsage";

export function AccountUsageMenuSection({
	workspaceId,
	terminalId,
}: {
	workspaceId: string;
	terminalId: string;
}) {
	const { t } = useLingui();
	const { account, binding, now, state, status } = useAccountUsage(
		workspaceId,
		terminalId,
	);
	if (!binding) return null;
	const windows =
		state === "ready" || state === "stale" ? (account?.windows ?? []) : [];
	const date = account
		? formatDate(new Date(account.fetchedAt), {
				hour: "numeric",
				minute: "2-digit",
			})
		: null;
	const details = [
		account?.credentialKind === "subscription"
			? t({ message: "Shared across sessions using this login." })
			: null,
		date ? t({ message: `Updated ${date}` }) : null,
	]
		.filter(Boolean)
		.join("\n");

	return (
		<>
			<DropdownMenuSeparator />
			<DropdownMenuItem
				asChild
				className="flex-col items-stretch gap-2 rounded-md border border-border/60 bg-muted/30 p-2.5 focus:border-border focus:bg-accent"
			>
				<Link
					to="/settings/usage"
					search={{
						workspaceId,
						accountKey: account?.accountKey,
						agent: binding.agentId,
					}}
					title={details || undefined}
				>
					<div className="flex min-w-0 items-center gap-1.5 text-xs">
						<span className="truncate">
							{account?.email ?? AGENT_IDENTITY_LABELS[binding.agentId]}
						</span>
						{account?.plan && (
							<span className="shrink-0 rounded bg-foreground/10 px-1 text-[10px] text-muted-foreground capitalize">
								{account.plan}
							</span>
						)}
						<ArrowUpRight className="ml-auto size-3.5" />
					</div>
					{status && <p className="text-muted-foreground text-xs">{status}</p>}
					{windows.map((window) => {
						const resetsAt = window.resetsAt ? new Date(window.resetsAt) : null;
						const resetPending = resetsAt && resetsAt.getTime() > now.getTime();
						return (
							<div
								key={window.id}
								title={
									resetPending ? formatResetLabel(resetsAt, now) : undefined
								}
							>
								<div className="flex items-baseline gap-2 text-xs">
									<span className="min-w-0 flex-1 truncate">
										{window.label}
									</span>
									{resetPending && (
										<span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
											{formatResetIn(resetsAt, now)}
										</span>
									)}
									<span className="w-9 shrink-0 text-right tabular-nums">
										{formatPercent(window.usedPercent / 100)}
									</span>
								</div>
								<div className="mt-1 h-1 overflow-hidden rounded-full bg-foreground/10">
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
							</div>
						);
					})}
				</Link>
			</DropdownMenuItem>
		</>
	);
}
