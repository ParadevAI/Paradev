import { Trans, useLingui } from "@lingui/react/macro";
import { formatPercent } from "@superset/i18n/format";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { useRouter } from "@tanstack/react-router";
import { ArrowUpRight, Check, ChevronDown, UserRound } from "lucide-react";
import {
	type UsageAccount,
	useHostUsageQuota,
} from "renderer/hooks/host-service/useHostUsageQuota";
import type { TerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import {
	MENU_PANEL_CLASS,
	MENU_ROW_CLASS,
	PILL_CHEVRON_CLASS,
	PILL_TRIGGER_CLASS,
} from "renderer/routes/_authenticated/components/AgentComposer/constants";
import { useSetDefaultUsageAccount } from "renderer/routes/_authenticated/settings/usage/hooks/useSetDefaultUsageAccount";

export type SwitchableAgent = "claude" | "codex";
export type SwitchAccount = (
	setAccount: () => Promise<unknown>,
) => Promise<void>;

export type AccountSwitch = {
	/** Which agent's logins the host can switch between. */
	agent: SwitchableAgent;
	hostUrl?: string | null | undefined;
	sessionAccount?: TerminalAgentBinding["account"];
	onSwitch?: SwitchAccount | undefined;
};
type MenuAlign = "start" | "end";

/** The window nearest to full, which is the one that bites first. */
function tightest(account: UsageAccount) {
	return account.windows.reduce<UsageAccount["windows"][number] | null>(
		(best, candidate) =>
			best === null || candidate.usedPercent > best.usedPercent
				? candidate
				: best,
		null,
	);
}

/** Names the login the chat runs on and moves the chat to another one the host knows. */
export function UsageAccountMenu({
	agent,
	hostUrl,
	sessionAccount,
	onSwitch,
	align = "end",
}: AccountSwitch & { align?: MenuAlign }) {
	const { t } = useLingui();
	const router = useRouter({ warn: false });
	const quota = useHostUsageQuota(hostUrl ?? null);
	const setDefault = useSetDefaultUsageAccount(hostUrl ?? null);
	const accounts = (quota.data ?? []).filter(
		(account) => account.agent === agent,
	);
	const current = accounts.find(
		(account) =>
			account.agent === sessionAccount?.agent &&
			account.selection === sessionAccount.selection &&
			account.credentialKind === sessionAccount.credentialKind,
	);
	const email = sessionAccount?.email ?? current?.email;
	const openUsage = () => void router?.navigate({ to: "/settings/usage" });
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					aria-label={t({ message: "Switch account" })}
					className={cn(PILL_TRIGGER_CLASS, "group max-w-56")}
					title={email ?? undefined}
					type="button"
				>
					<UserRound className="size-3.5 shrink-0" />
					<span className="truncate">
						{email ?? current?.sourceLabel ?? <Trans>Account</Trans>}
					</span>
					<ChevronDown className={PILL_CHEVRON_CLASS} />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align={align}
				className={cn(MENU_PANEL_CLASS, "w-[280px] p-1")}
				side="top"
			>
				{accounts.length > 1 && (
					<DropdownMenuLabel className="px-2 py-1.5 font-normal text-[11px] text-muted-foreground">
						<Trans>Continue this chat on another login</Trans>
					</DropdownMenuLabel>
				)}
				{accounts.map((account) => {
					const isCurrent = account === current;
					const window = tightest(account);
					return (
						<DropdownMenuItem
							className={cn(MENU_ROW_CLASS, "h-auto items-center py-1.5")}
							disabled={isCurrent || setDefault.isPending || !onSwitch}
							key={account.accountKey}
							onSelect={() => {
								void onSwitch?.(() =>
									setDefault.mutateAsync({
										agent,
										selection: account.selection,
									}),
								);
							}}
						>
							<span className="flex size-3.5 shrink-0 items-center justify-center">
								{isCurrent && <Check className="size-3.5" />}
							</span>
							<span className="min-w-0 flex-1">
								<span className="block truncate">
									{account.email ?? account.sourceLabel}
								</span>
								<span className="block truncate text-[11px] text-muted-foreground">
									{[
										account.plan,
										window
											? t({
													message: `${window.label} · ${formatPercent(window.usedPercent / 100)} used`,
												})
											: undefined,
									]
										.filter(Boolean)
										.join(" · ")}
								</span>
							</span>
						</DropdownMenuItem>
					);
				})}
				{accounts.length > 0 && <DropdownMenuSeparator />}
				<DropdownMenuItem className={MENU_ROW_CLASS} onSelect={openUsage}>
					<ArrowUpRight className="size-3.5" />
					{accounts.length > 1 ? (
						<Trans>Usage settings</Trans>
					) : (
						<Trans>Add an account in Usage settings</Trans>
					)}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
