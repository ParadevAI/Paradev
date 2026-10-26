import { Trans, useLingui } from "@lingui/react/macro";
import type { ChatTransport } from "@superset/chat/client";
import type { ChatAccountSelection } from "@superset/chat/protocol";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { HOST_USAGE_QUOTA_QUERY_KEY } from "renderer/hooks/host-service/useHostUsageQuota";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { AccountTerminalForm } from "../../../../../../../../components/AccountTerminalDialog/components/AccountTerminalForm";
import { switchAccountConversation } from "./switchAccountConversation";

export function supportsAccountSwitch(
	capabilities: { accountSwitch?: boolean; harnesses: string[] } | undefined,
	provider: string,
) {
	return (
		capabilities?.accountSwitch === true &&
		capabilities.harnesses.includes(`${provider}-acp`)
	);
}

export function AccountSwitchConfirmation({
	confirmed,
	switching,
	onChange,
}: {
	confirmed: boolean;
	switching: boolean;
	onChange(value: boolean): void;
}) {
	return (
		<label className="flex items-start gap-2 rounded-md border p-3 text-sm">
			<input
				type="checkbox"
				className="mt-0.5 size-4 shrink-0"
				checked={confirmed}
				disabled={switching}
				onChange={(event) => onChange(event.currentTarget.checked)}
			/>
			<Trans>
				Close only this idle agent and switch. Finish background work and save
				any unsent draft first.
			</Trans>
		</label>
	);
}

export function AccountChatSwitch({
	hostUrl,
	provider,
	current,
	sessionId,
	transport,
	disabled,
	onSwitched,
}: {
	hostUrl: string | null;
	provider: "claude" | "codex";
	current: ChatAccountSelection;
	sessionId: string;
	transport: ChatTransport;
	disabled: boolean;
	onSwitched(result: { sessionId: string; terminalId: string }): void;
}) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const [confirmed, setConfirmed] = useState(false);
	const [switching, setSwitching] = useState(false);
	const capabilities = useQuery({
		queryKey: ["chat-account-capabilities", hostUrl],
		queryFn: () => transport.accountCapabilities(undefined),
		retry: false,
		staleTime: 30_000,
	});
	const configs = useV2AgentConfigs(hostUrl);
	const config = configs.data?.find((entry) => entry.presetId === provider);
	const accounts = useQuery({
		queryKey: ["agent-launch-accounts", hostUrl, config?.id],
		enabled: Boolean(open && hostUrl && config),
		queryFn: () =>
			getHostServiceClientByUrl(hostUrl as string).agents.launchAccounts.query({
				agent: config?.id as string,
			}),
		retry: false,
		staleTime: 0,
	});
	const quota = useQuery({
		queryKey: [...HOST_USAGE_QUOTA_QUERY_KEY, hostUrl],
		enabled: Boolean(open && hostUrl && accounts.data?.supported),
		queryFn: () =>
			getHostServiceClientByUrl(hostUrl as string).usage.quota.query(),
		retry: false,
		staleTime: 5 * 60_000,
	});
	// An old host or an unqualified harness keeps the original chat controls.
	if (!supportsAccountSwitch(capabilities.data, provider)) return null;
	const failure = configs.error ?? accounts.error;
	return (
		<>
			<Button
				variant="ghost"
				size="sm"
				disabled={disabled}
				onClick={() => {
					setConfirmed(false);
					setOpen(true);
				}}
			>
				<Trans>Switch account</Trans>
			</Button>
			<Dialog
				open={open}
				onOpenChange={(value) => {
					if (!switching) setOpen(value);
				}}
			>
				<DialogContent
					className="max-h-[90vh] overflow-y-auto sm:max-w-md"
					showCloseButton={!switching}
				>
					<DialogHeader>
						<DialogTitle>
							<Trans>Switch account</Trans>
						</DialogTitle>
						<DialogDescription>
							<Trans>
								Reopen this exact saved conversation with another account. Other
								chats stay running. No message is sent.
							</Trans>
						</DialogDescription>
					</DialogHeader>
					<AccountSwitchConfirmation
						confirmed={confirmed}
						switching={switching}
						onChange={setConfirmed}
					/>
					<AccountTerminalForm
						configs={config ? [config] : []}
						configId={config?.id ?? ""}
						onConfigChange={() => {}}
						accounts={
							accounts.data?.supported
								? accounts.data.accounts.filter(
										(account) =>
											account.selection !== current.selection ||
											account.identity !== current.identity,
									)
								: []
						}
						provider={provider}
						quotas={quota.isError ? [] : (quota.data ?? [])}
						loading={configs.isPending || Boolean(config && accounts.isPending)}
						refreshing={accounts.isFetching}
						error={
							failure
								? errorMessage(
										failure,
										t({ message: "Could not load accounts" }),
									)
								: !configs.isPending && !config
									? t({ message: "No agent is configured on this host" })
									: accounts.data?.supported === false
										? t({
												message:
													"This agent configuration does not support account selection.",
											})
										: null
						}
						launching={switching}
						launchDisabled={!confirmed || disabled}
						submitLabel={t({ message: "Switch account" })}
						launchFailureMessage={t({ message: "Could not switch account" })}
						onRefresh={async () => {
							await accounts.refetch();
						}}
						onCancel={() => setOpen(false)}
						onLaunch={async (account) => {
							if (!confirmed || disabled)
								throw new Error(
									t({
										message:
											"Confirm that this agent can close safely before switching.",
									}),
								);
							setSwitching(true);
							try {
								const result = await switchAccountConversation(transport, {
									commandId: crypto.randomUUID(),
									sessionId,
									account,
								});
								onSwitched(result);
								setOpen(false);
							} finally {
								setSwitching(false);
							}
						}}
					/>
				</DialogContent>
			</Dialog>
		</>
	);
}
