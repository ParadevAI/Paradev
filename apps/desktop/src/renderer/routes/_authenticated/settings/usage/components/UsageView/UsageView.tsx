import { Trans } from "@lingui/react/macro";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useEffect, useRef, useState } from "react";
import { LuEye, LuEyeOff, LuRefreshCw } from "react-icons/lu";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { useHostUsageQuota } from "renderer/hooks/host-service/useHostUsageQuota";
import { QUOTA_AGENT_LABELS } from "renderer/utils/usage/quotaAgentLabels";
import { AgentAccounts } from "../../../components/AgentAccounts";
import { AccountCard } from "../../../components/AgentAccounts/components/AccountCard";
import { dedupeUsageAccounts } from "../../../components/AgentAccounts/utils/dedupeUsageAccounts";
import {
	isManagedAgent,
	visibleQuotaAgents,
} from "../../../components/AgentAccounts/utils/visibleQuotaAgents";
import { LeaderboardCard } from "../LeaderboardCard";
import { UsageHistorySection } from "../UsageHistorySection";

export function UsageView({
	hostUrl,
	focusedAccountKey,
	focusedAgent,
}: {
	hostUrl: string | null;
	focusedAccountKey?: string;
	focusedAgent?: string;
}) {
	const focusRef = useRef<HTMLDivElement>(null);
	const focusedOnce = useRef<string | null>(null);
	const cloudEnabled =
		useFeatureFlagEnabled(FEATURE_FLAGS.CLOUD_WORKSPACES) === true;
	const quotaQuery = useHostUsageQuota(hostUrl);
	const isDark = useIsDarkTheme();
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [hideEmails, setHideEmails] = useState(false);

	const accounts = dedupeUsageAccounts(quotaQuery.data ?? []);
	useEffect(() => {
		const key = `${hostUrl}:${focusedAgent}:${focusedAccountKey}`;
		if (
			accounts.length > 0 &&
			focusedOnce.current !== key &&
			focusRef.current
		) {
			focusRef.current.scrollIntoView({ block: "center" });
			focusRef.current.focus({ preventScroll: true });
			focusedOnce.current = key;
		}
	}, [hostUrl, focusedAgent, focusedAccountKey, accounts]);
	const isBusy = quotaQuery.isFetching || isRefreshing;

	return (
		<div className="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-3 px-6 py-4">
			<LeaderboardCard hostUrl={hostUrl} />
			<div className="flex items-center gap-2">
				<span className="ml-auto text-[10px] text-muted-foreground">
					<Trans>Official quota · refreshes every 5 min</Trans>
				</span>
				<Button
					variant="ghost"
					size="sm"
					className="h-6 gap-1 px-1.5 text-[10px] text-muted-foreground"
					aria-pressed={hideEmails}
					onClick={() => setHideEmails((hidden) => !hidden)}
				>
					{hideEmails ? (
						<LuEye className="size-3" />
					) : (
						<LuEyeOff className="size-3" />
					)}
					{hideEmails ? <Trans>Show emails</Trans> : <Trans>Hide emails</Trans>}
				</Button>
				<Button
					variant="ghost"
					size="icon"
					className="size-6"
					disabled={isBusy || !hostUrl}
					onClick={() => {
						setIsRefreshing(true);
						void quotaQuery
							.refresh()
							// A failed refresh keeps the last good data; the next poll retries.
							.catch(() => {})
							.finally(() => setIsRefreshing(false));
					}}
				>
					<LuRefreshCw className={cn("size-3", isBusy && "animate-spin")} />
				</Button>
			</div>

			{visibleQuotaAgents(accounts).map((agent) => {
				const icon = getPresetIcon(agent, isDark);
				const heading = (
					<div className="flex items-center gap-1.5">
						{icon && <img src={icon} alt="" className="size-3.5" />}
						<span className="text-xs font-medium">
							{QUOTA_AGENT_LABELS[agent]}
						</span>
					</div>
				);
				if (isManagedAgent(agent)) {
					return (
						<AgentAccounts
							key={agent}
							agent={agent}
							label={QUOTA_AGENT_LABELS[agent]}
							cloudEnabled={cloudEnabled}
							hostUrl={hostUrl}
							heading={heading}
							description={null}
							hideEmails={hideEmails}
							focusedAccountKey={
								!focusedAgent || focusedAgent === agent
									? focusedAccountKey
									: undefined
							}
						/>
					);
				}
				const agentAccounts = accounts.filter(
					(account) => account.agent === agent,
				);
				return (
					<section key={agent} className="flex flex-col gap-1.5">
						{heading}
						{agentAccounts.map((account) => (
							<div
								key={account.accountKey}
								ref={
									account.accountKey === focusedAccountKey &&
									(!focusedAgent || account.agent === focusedAgent)
										? focusRef
										: undefined
								}
								tabIndex={-1}
								className={cn(
									"rounded-lg outline-none md:w-1/2",
									account.accountKey === focusedAccountKey &&
										(!focusedAgent || account.agent === focusedAgent) &&
										"ring-2 ring-ring ring-offset-2 ring-offset-background",
								)}
							>
								<AccountCard
									account={account}
									onMakeDefault={null}
									onSwitchSignIn={null}
									onRemove={null}
									isSwitching={false}
									selectable={false}
									hideEmails={hideEmails}
								/>
							</div>
						))}
					</section>
				);
			})}

			<UsageHistorySection hostUrl={hostUrl} />
		</div>
	);
}
