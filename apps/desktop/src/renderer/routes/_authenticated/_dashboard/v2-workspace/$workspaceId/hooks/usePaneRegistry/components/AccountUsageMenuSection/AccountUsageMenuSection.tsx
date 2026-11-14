import { Trans, useLingui } from "@lingui/react/macro";
import { formatDate, formatPercent } from "@superset/i18n/format";
import { AGENT_IDENTITY_LABELS } from "@superset/shared/agent-catalog";
import {
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { formatResetLabel } from "renderer/utils/usage/formatResetIn";
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
	const date = account
		? formatDate(new Date(account.fetchedAt), {
				hour: "numeric",
				minute: "2-digit",
			})
		: null;
	const windows =
		state === "ready" || state === "stale" ? (account?.windows ?? []) : [];
	return (
		<>
			<DropdownMenuSeparator />
			<DropdownMenuLabel className="font-normal text-muted-foreground text-xs">
				<Trans>Account usage</Trans>
			</DropdownMenuLabel>
			<div className="flex flex-col gap-2 px-2 pb-1.5">
				<div className="min-w-0">
					<p className="truncate text-xs">
						{account?.email ?? AGENT_IDENTITY_LABELS[binding.agentId]}
					</p>
					{account?.plan && (
						<p className="text-[11px] text-muted-foreground">{account.plan}</p>
					)}
				</div>
				{status && <p className="text-muted-foreground text-xs">{status}</p>}
				{windows.map((window) => {
					const used = formatPercent(window.usedPercent / 100);
					const resetsAt = window.resetsAt ? new Date(window.resetsAt) : null;
					return (
						<div key={window.id}>
							<div className="flex justify-between gap-3 text-xs">
								<span className="truncate">{window.label}</span>
								<span className="shrink-0 tabular-nums">
									<Trans>{used} used</Trans>
								</span>
							</div>
							<div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
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
							<p className="mt-0.5 text-[11px] text-muted-foreground">
								{resetsAt && resetsAt.getTime() > now.getTime() ? (
									formatResetLabel(resetsAt, now)
								) : (
									<Trans>Reset time unavailable</Trans>
								)}
							</p>
						</div>
					);
				})}
				{account?.credentialKind === "subscription" && (
					<p className="text-[11px] text-muted-foreground">
						<Trans>Shared across sessions using this login.</Trans>
					</p>
				)}
				{date && (
					<p className="text-[10px] text-muted-foreground">
						{t({ message: `Updated ${date}` })}
					</p>
				)}
			</div>
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
