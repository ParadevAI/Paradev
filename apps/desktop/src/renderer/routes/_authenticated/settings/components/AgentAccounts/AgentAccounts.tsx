import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { Cloud, Plus } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { LuRefreshCw } from "react-icons/lu";
import type { UsageAccount } from "renderer/hooks/host-service/useHostUsageQuota";
import { useHostUsageQuota } from "renderer/hooks/host-service/useHostUsageQuota";
import { CloudAuthDialog } from "renderer/routes/_authenticated/components/CloudAuthDialog";
import {
	isConfigured,
	type SaveCredentialInput,
	useAgentCredential,
} from "renderer/routes/_authenticated/hooks/useAgentCredential";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { QUOTA_AGENT_LABELS } from "renderer/utils/usage/quotaAgentLabels";
import { AccountCard } from "./components/AccountCard";
import {
	AddAccountDialog,
	type SwitchSignInTarget,
} from "./components/AddAccountDialog";
import { RemoveAccountDialog } from "./components/RemoveAccountDialog";
import {
	RestartSessionsDialog,
	type RestartSessionsPrompt,
} from "./components/RestartSessionsDialog";
import { useRemoveUsageAccount } from "./hooks/useRemoveUsageAccount";
import { useRestartAgentSessions } from "./hooks/useRestartAgentSessions";
import { useSetDefaultUsageAccount } from "./hooks/useSetDefaultUsageAccount";
import { isAccountInCloud } from "./utils/cloudAccountState";
import { dedupeUsageAccounts } from "./utils/dedupeUsageAccounts";
import type { ManagedAgent } from "./utils/visibleQuotaAgents";

export function AgentAccounts({
	agent,
	label,
	cloudEnabled,
	hostUrl: hostUrlOverride,
	heading,
	description,
	hideEmails = false,
	focusedAccountKey,
}: {
	agent: ManagedAgent;
	label: string;
	cloudEnabled: boolean;
	hostUrl?: string | null;
	heading?: ReactNode;
	description?: ReactNode;
	hideEmails?: boolean;
	focusedAccountKey?: string;
}) {
	const { t } = useLingui();
	const cloud = useAgentCredential(agent, { enabled: cloudEnabled });
	const cloudConfigured = cloudEnabled && isConfigured(cloud.state);
	const [cloudDialog, setCloudDialog] = useState<{
		open: boolean;
		forEmail: string | null;
	}>({ open: false, forEmail: null });
	const { activeHostUrl } = useLocalHostService();
	const hostUrl =
		hostUrlOverride === undefined ? activeHostUrl : hostUrlOverride;
	const focusRef = useRef<HTMLDivElement>(null);
	const focusedOnce = useRef<string | null>(null);
	const quotaQuery = useHostUsageQuota(hostUrl);
	const setDefault = useSetDefaultUsageAccount(hostUrl);
	const removeAccount = useRemoveUsageAccount(hostUrl);
	const { countRestartCandidates, restartMutation } =
		useRestartAgentSessions(hostUrl);
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [switchTarget, setSwitchTarget] = useState<SwitchSignInTarget | null>(
		null,
	);
	const [removeTarget, setRemoveTarget] = useState<UsageAccount | null>(null);
	const [restartPrompt, setRestartPrompt] =
		useState<RestartSessionsPrompt | null>(null);

	const accounts = dedupeUsageAccounts(quotaQuery.data ?? []).filter(
		(account) => account.agent === agent,
	);
	const providerLabel = QUOTA_AGENT_LABELS[agent];
	useEffect(() => {
		const key = `${hostUrl}:${focusedAccountKey}`;
		if (!focusedAccountKey || focusedOnce.current === key || !focusRef.current)
			return;
		focusRef.current.scrollIntoView({ block: "center" });
		focusRef.current.focus({ preventScroll: true });
		focusedOnce.current = key;
	});
	const inCloud = (account: UsageAccount) =>
		isAccountInCloud({
			email: account.email,
			cloudAccountLabel: cloud.accountLabel,
			cloudConfigured,
		});
	const openCloudDialog = (forEmail: string | null) =>
		setCloudDialog({ open: true, forEmail });
	const saveCloud = (input: SaveCredentialInput) =>
		cloud.save({
			...input,
			accountLabel: input.accountLabel ?? cloudDialog.forEmail ?? undefined,
		});
	const openAddAccount = () => {
		setSwitchTarget(null);
		setIsDialogOpen(true);
	};

	const showMadeDefaultToast = (accountLabel: string) => {
		toast.success(
			t({
				message: `New ${providerLabel} agents will use ${accountLabel}.`,
			}),
			{
				description: t({
					message: "Relaunch running agents to switch them.",
				}),
			},
		);
	};

	const handleDefaultSwitched = async (accountLabel: string) => {
		let candidateCount = 0;
		try {
			candidateCount = await countRestartCandidates(agent);
		} catch {
			// Fall through to the plain toast.
		}
		if (candidateCount > 0) {
			setRestartPrompt({
				agent,
				providerLabel,
				accountLabel,
				count: candidateCount,
			});
			return;
		}
		showMadeDefaultToast(accountLabel);
	};

	const makeDefaultAccount = (account: UsageAccount) => {
		setDefault.mutate(
			{ agent, selection: account.selection },
			{
				onSuccess: () => {
					void handleDefaultSwitched(account.email ?? account.sourceLabel);
				},
				onError: (error) => toast.error(errorMessage(error)),
			},
		);
	};

	const openSwitchSignIn = (account: UsageAccount) => {
		setSwitchTarget({
			agent,
			credentialKind: account.credentialKind,
			selection: account.selection,
			label:
				account.selection === null
					? (account.email ?? account.sourceLabel)
					: account.sourceLabel,
		});
		setIsDialogOpen(true);
	};

	const refresh = () => {
		void quotaQuery.refresh().catch(() => {});
	};

	const cloudFooter = (account: UsageAccount) => {
		if (!cloudEnabled) return undefined;
		if (inCloud(account)) {
			return (
				<span className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px]">
					<Cloud className="size-3" />
					<Trans>Cloud</Trans>
				</span>
			);
		}
		return (
			<Button
				variant="outline"
				size="sm"
				className="h-5 gap-1 rounded border-dashed px-1.5 text-[10px]"
				onClick={() => openCloudDialog(account.email)}
			>
				<Cloud className="size-3" />
				<Trans>Sync to cloud</Trans>
			</Button>
		);
	};

	return (
		<section className="space-y-2">
			<div className="flex items-center justify-between gap-3">
				<div>
					{heading ?? (
						<h3 className="text-sm font-medium">
							<Trans>Accounts</Trans>
						</h3>
					)}
					{description === undefined ? (
						<p className="text-xs text-muted-foreground">
							<Trans>New agent launches use the default account.</Trans>
						</p>
					) : (
						description
					)}
				</div>
				<Button
					size="sm"
					variant="outline"
					className="shrink-0 gap-1.5"
					disabled={!hostUrl}
					onClick={openAddAccount}
				>
					<Plus className="size-3.5" />
					<Trans>Add account</Trans>
				</Button>
			</div>

			{quotaQuery.isPending ? (
				<div className="flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-[11px] text-muted-foreground">
					<LuRefreshCw className="size-3 animate-spin" />
					<Trans>Reading usage…</Trans>
				</div>
			) : accounts.length === 0 ? (
				<div className="rounded-lg border border-dashed px-3 py-2 text-[11px] text-muted-foreground">
					<Trans>
						No {QUOTA_AGENT_LABELS[agent]} logins on this host. Sign in and
						usage appears here.
					</Trans>
				</div>
			) : (
				<div className="grid gap-2 md:grid-cols-2">
					{accounts.map((account) => (
						<div
							key={account.accountKey}
							ref={
								account.accountKey === focusedAccountKey ? focusRef : undefined
							}
							tabIndex={-1}
							className={cn(
								"rounded-lg outline-none",
								account.accountKey === focusedAccountKey &&
									"ring-2 ring-ring ring-offset-2 ring-offset-background",
							)}
						>
							<AccountCard
								account={account}
								onMakeDefault={() => makeDefaultAccount(account)}
								onSwitchSignIn={() => openSwitchSignIn(account)}
								onRemove={
									account.selection !== null
										? () => setRemoveTarget(account)
										: null
								}
								isSwitching={setDefault.isPending}
								selectable={accounts.length > 1}
								hideEmails={hideEmails}
								footerAction={cloudFooter(account)}
							/>
						</div>
					))}
				</div>
			)}

			<RemoveAccountDialog
				account={removeTarget}
				onOpenChange={(open) => {
					if (!open) setRemoveTarget(null);
				}}
				isRemoving={removeAccount.isPending}
				onConfirm={() => {
					if (!removeTarget || removeTarget.selection === null) return;
					removeAccount.mutate(
						{ agent, selection: removeTarget.selection },
						{
							onSuccess: () => {
								const removedLabel =
									removeTarget.email ?? removeTarget.sourceLabel;
								toast.success(t({ message: `Removed ${removedLabel}.` }));
								setRemoveTarget(null);
							},
							onError: (error) => toast.error(errorMessage(error)),
						},
					);
				}}
			/>

			<RestartSessionsDialog
				prompt={restartPrompt}
				onDecline={() => {
					if (!restartPrompt) return;
					const { accountLabel } = restartPrompt;
					setRestartPrompt(null);
					showMadeDefaultToast(accountLabel);
				}}
				onConfirm={() => {
					if (!restartPrompt) return;
					const { accountLabel } = restartPrompt;
					setRestartPrompt(null);
					restartMutation.mutate(
						{ agent },
						{
							onSuccess: () => {
								toast.success(
									t({ message: `Restarting agents on ${accountLabel}.` }),
									{
										description: t({
											message: "Each session resumes where it left off.",
										}),
									},
								);
							},
							onError: (error) => toast.error(errorMessage(error)),
						},
					);
				}}
			/>

			{cloudEnabled && (
				<CloudAuthDialog
					accountLabel={cloud.accountLabel}
					chooseMethod={cloud.chooseMethod}
					disconnect={cloud.disconnect}
					label={label}
					onOpenChange={(open) =>
						setCloudDialog((current) => ({ ...current, open }))
					}
					open={cloudDialog.open}
					presetId={agent}
					save={saveCloud}
					setManual={cloud.setManual}
					signedIn={cloud.signedIn}
					state={cloud.state}
				/>
			)}

			<AddAccountDialog
				open={isDialogOpen}
				onOpenChange={(open) => {
					setIsDialogOpen(open);
					if (!open) setSwitchTarget(null);
				}}
				agent={agent}
				switchTarget={switchTarget}
				hostUrl={hostUrl}
				onDefaultSwitched={(_agent, accountLabel) => {
					void handleDefaultSwitched(accountLabel);
				}}
				onAccountAdded={refresh}
			/>
		</section>
	);
}
