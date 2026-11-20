import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import {
	LuCheck,
	LuCircle,
	LuCircleCheck,
	LuCopy,
	LuEllipsis,
	LuExternalLink,
} from "react-icons/lu";
import { QuotaWindowRow } from "renderer/components/QuotaWindowRow";
import type { UsageAccount } from "renderer/hooks/host-service/useHostUsageQuota";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { QUOTA_AGENT_LABELS } from "renderer/utils/usage/quotaAgentLabels";
import { API_BILLING_LINKS } from "../../utils/apiBilling";
import { switchSignInCommand } from "../../utils/switchSignInCommand";
import type { ManagedAgent, QuotaAgent } from "../../utils/visibleQuotaAgents";
import { isManagedAgent } from "../../utils/visibleQuotaAgents";

/** Re-auth command for agents whose logins Superset only reads. */
const READ_ONLY_LOGIN_COMMANDS: Record<
	Exclude<QuotaAgent, ManagedAgent>,
	string
> = {
	grok: "grok login",
	agy: "agy",
	opencode: "opencode auth login",
};

function creditsLine(account: UsageAccount): string | null {
	if (account.creditsBalance !== null) {
		const balance = account.creditsBalance.toFixed(2);
		return i18n._(
			msg({
				message: `$${balance} credits`,
			}),
		);
	}
	if (account.extraUsage) {
		const used = (account.extraUsage.usedCents / 100).toFixed(2);
		const limit = (account.extraUsage.limitCents / 100).toFixed(2);
		return i18n._(
			msg({
				message: `extra $${used} of $${limit}`,
			}),
		);
	}
	return null;
}

const DEFAULT_TITLE = msg({
	message:
		"New agent launches use this account. Relaunch a running agent to switch it.",
});

export function AccountCard({
	account,
	onMakeDefault,
	onSwitchSignIn,
	onRemove,
	isSwitching,
	selectable,
	hideEmails,
	footerAction,
}: {
	account: UsageAccount;
	onMakeDefault: (() => void) | null;
	onSwitchSignIn: (() => void) | null;
	/** Null on the system-default card — the main login is never removable. */
	onRemove: (() => void) | null;
	isSwitching: boolean;
	/** True when the agent has several accounts, so the cards read as a
	 * radio group: the default gets a check + accent border, the rest get a
	 * selectable circle. */
	selectable: boolean;
	/** Replaces account emails so screenshots do not retain identifying pixels. */
	hideEmails: boolean;
	footerAction?: ReactNode;
}) {
	const { t } = useLingui();
	const credits = creditsLine(account);
	const { copyToClipboard, copied } = useCopyToClipboard();
	const expiredCommand =
		account.status === "token_expired"
			? isManagedAgent(account.agent)
				? switchSignInCommand(account as UsageAccount & { agent: ManagedAgent })
				: READ_ONLY_LOGIN_COMMANDS[account.agent]
			: null;
	return (
		<div
			className={cn(
				"group rounded-lg border bg-card/40 p-2.5",
				selectable &&
					account.isDefault &&
					"border-primary/60 bg-primary/[0.04] ring-1 ring-primary/40",
			)}
		>
			<div className="flex items-baseline gap-1.5">
				{selectable &&
					(account.isDefault ? (
						<span
							className="shrink-0 self-center"
							title={i18n._(DEFAULT_TITLE)}
						>
							<LuCircleCheck className="size-3.5 text-primary" />
						</span>
					) : (
						<button
							type="button"
							className="shrink-0 self-center text-muted-foreground/50 transition-colors hover:text-primary disabled:pointer-events-none"
							disabled={isSwitching}
							title={t({
								message:
									"Make default: launch new terminals and agents on this account.",
							})}
							onClick={onMakeDefault ?? undefined}
						>
							<LuCircle className="size-3.5" />
						</button>
					))}
				<span
					className={cn(
						"truncate text-xs font-medium transition-[filter]",
						hideEmails && account.email && "select-none blur-[5px]",
					)}
				>
					{hideEmails && account.email ? (
						<Trans>Email hidden</Trans>
					) : (
						(account.email ?? QUOTA_AGENT_LABELS[account.agent])
					)}
				</span>
				{account.plan && (
					<span className="rounded bg-muted px-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
						{account.plan}
					</span>
				)}
				{account.credentialKind === "api_key" && (
					<span className="rounded bg-muted px-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
						<Trans>API</Trans>
					</span>
				)}
				{account.status !== "ok" && account.status !== "token_stale" && (
					<span className="rounded bg-amber-500/15 px-1 text-[9px] font-medium uppercase tracking-wide text-amber-500">
						{account.status === "token_expired" ? (
							<Trans>Sign-in expired</Trans>
						) : account.status === "signed_out" ? (
							<Trans>Signed out</Trans>
						) : (
							<Trans>Unavailable</Trans>
						)}
					</span>
				)}
				<span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
					{/* Source label always shows — it is the only thing that tells two
					    profiles of the same account apart. */}
					{account.sourceLabel}
				</span>
				{(onSwitchSignIn || onRemove) && (
					<DropdownMenu modal={false}>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="size-4 shrink-0 self-center text-muted-foreground"
							>
								<LuEllipsis className="size-3" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							{onSwitchSignIn && (
								<DropdownMenuItem onClick={onSwitchSignIn}>
									<Trans>Switch sign-in…</Trans>
								</DropdownMenuItem>
							)}
							{onRemove && (
								<DropdownMenuItem variant="destructive" onClick={onRemove}>
									<Trans>Remove…</Trans>
								</DropdownMenuItem>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			</div>
			{account.credentialKind === "api_key" ? (
				// Pay-per-token billing has no quota windows; point at the
				// provider's own usage page instead.
				<div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
					<span className="truncate">
						<Trans>Billed per token.</Trans>
					</span>
					{isManagedAgent(account.agent) && (
						<a
							href={API_BILLING_LINKS[account.agent].usage}
							target="_blank"
							rel="noopener noreferrer"
							className="ml-auto inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap hover:text-foreground hover:underline"
						>
							<Trans>View usage</Trans>
							<LuExternalLink className="size-2.5" />
						</a>
					)}
				</div>
			) : account.status === "ok" ? (
				<div className="mt-2 flex flex-col gap-1.5">
					{account.windows.map((window) => (
						<QuotaWindowRow key={window.id} window={window} />
					))}
				</div>
			) : account.status === "token_stale" ? (
				<div className="mt-1.5 text-[11px] text-muted-foreground">
					{account.agent === "opencode" ? (
						<Trans>Refreshes when OpenCode next runs.</Trans>
					) : (
						<Trans>Refreshes when Claude Code next runs.</Trans>
					)}
				</div>
			) : expiredCommand !== null ? (
				<div className="mt-1.5 flex flex-wrap items-center gap-x-1 gap-y-1 text-[11px] text-muted-foreground">
					<span>
						<Trans>Sign-in expired. Run</Trans>
					</span>
					<button
						type="button"
						className="inline-flex max-w-full items-center gap-1 rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-foreground transition-colors hover:bg-muted/70"
						title={expiredCommand}
						onClick={() =>
							copyToClipboard(expiredCommand).catch(() =>
								toast.error(
									t({
										message: "Copy failed",
									}),
									{ description: expiredCommand },
								),
							)
						}
					>
						<span className="min-w-0 truncate">{expiredCommand}</span>
						{copied ? (
							<LuCheck className="size-2.5 shrink-0 text-green-500" />
						) : (
							<LuCopy className="size-2.5 shrink-0" />
						)}
					</button>
					<span>
						<Trans>in a terminal on this host.</Trans>
					</span>
				</div>
			) : (
				<div className="mt-1.5 text-[11px] text-muted-foreground">
					{account.statusDetail ?? <Trans>Usage unavailable.</Trans>}
				</div>
			)}
			{/* The radio + accent border already mark the default when the cards
			    read as a group; the footer label only carries it for a lone card. */}
			{((!account.isDefault && onMakeDefault !== null) ||
				(!selectable && account.isDefault) ||
				credits ||
				footerAction) && (
				<div className="mt-2 flex items-center gap-2 border-t pt-1.5">
					{account.isDefault ? (
						!selectable && (
							<span
								className="inline-flex items-center gap-1 text-[10px] font-medium text-primary"
								title={i18n._(DEFAULT_TITLE)}
							>
								<LuCircleCheck className="size-3" />
								<Trans>Default for new agents</Trans>
							</span>
						)
					) : onMakeDefault ? (
						<Button
							variant="outline"
							size="sm"
							className="h-5 rounded px-1.5 text-[10px]"
							disabled={isSwitching}
							title={i18n._(DEFAULT_TITLE)}
							onClick={onMakeDefault}
						>
							<Trans>Make default</Trans>
						</Button>
					) : null}
					{credits && (
						<span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
							{credits}
						</span>
					)}
					{footerAction && (
						<span className={cn("flex items-center", !credits && "ml-auto")}>
							{footerAction}
						</span>
					)}
				</div>
			)}
		</div>
	);
}
