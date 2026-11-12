import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Skeleton } from "@superset/ui/skeleton";
import { useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	CODING_AGENT_NAMES,
	type CodingAgentId,
	CodingAgentSetup,
	type CodingAgentSetupStep,
	useAgentInstallRunning,
	useAgentSignInState,
} from "renderer/routes/_authenticated/components/CodingAgentSetup";
import { SettingsRow } from "renderer/routes/_authenticated/settings/components/SettingsRow";

interface AgentInstallRowProps {
	agent: CodingAgentId;
}

export function AgentInstallRow({ agent }: AgentInstallRowProps) {
	const { t } = useLingui();
	const name = CODING_AGENT_NAMES[agent];
	const [pickedStep, setStep] = useState<CodingAgentSetupStep | null>(null);
	const installRunning = useAgentInstallRunning(agent);
	const step = pickedStep ?? (installRunning ? "install" : null);
	const status = electronTrpc.codingAgents.status.useQuery(
		{ agent },
		{ refetchOnWindowFocus: "always" },
	);
	const data = status.data;
	const installed = data?.installed === true;
	const { signedIn, account } = useAgentSignInState(agent, installed);
	const ownedByApp = data?.source === "paradev";

	const version = data?.version;
	const parts: string[] = [];
	if (!installed) {
		parts.push(t`Not installed`);
	} else {
		parts.push(version ? t`Installed · ${version}` : t`Installed`);
		if (!ownedByApp) parts.push(t`your own install`);
		if (signedIn !== null) {
			parts.push(
				signedIn
					? account
						? t`signed in as ${account}`
						: t`signed in`
					: t`not signed in`,
			);
		}
	}

	return (
		<div className="flex flex-col gap-3">
			<SettingsRow
				label={name}
				hint={
					status.isPending ? (
						<Skeleton className="h-3 w-40" />
					) : (
						parts.join(" · ")
					)
				}
			>
				{!status.isPending && step === null && (
					<div className="flex items-center gap-2">
						{installed && signedIn === false && (
							<Button
								size="sm"
								variant="outline"
								onClick={() => setStep("sign-in")}
							>
								<Trans>Sign in</Trans>
							</Button>
						)}
						{(!installed || ownedByApp) && (
							<Button
								size="sm"
								variant="outline"
								onClick={() => setStep("install")}
							>
								{installed ? <Trans>Update</Trans> : <Trans>Install</Trans>}
							</Button>
						)}
					</div>
				)}
			</SettingsRow>
			{step && (
				<CodingAgentSetup
					agent={agent}
					step={step}
					onInstalled={() => setStep(null)}
					onSignedIn={() => setStep(null)}
					onCancel={() => setStep(null)}
				/>
			)}
		</div>
	);
}
