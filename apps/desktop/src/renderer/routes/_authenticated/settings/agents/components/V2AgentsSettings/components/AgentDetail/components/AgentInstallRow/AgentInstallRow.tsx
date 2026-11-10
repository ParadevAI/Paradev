import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Label } from "@superset/ui/label";
import { Skeleton } from "@superset/ui/skeleton";
import { useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	CODING_AGENT_NAMES,
	type CodingAgentId,
	CodingAgentSetup,
	type CodingAgentSetupStep,
} from "renderer/routes/_authenticated/components/CodingAgentSetup";

interface AgentInstallRowProps {
	agent: CodingAgentId;
}

export function AgentInstallRow({ agent }: AgentInstallRowProps) {
	const { t } = useLingui();
	const name = CODING_AGENT_NAMES[agent];
	const [step, setStep] = useState<CodingAgentSetupStep | null>(null);
	const status = electronTrpc.codingAgents.status.useQuery(
		{ agent, signIn: true },
		{ refetchOnWindowFocus: "always" },
	);
	const data = status.data;
	const installed = data?.installed === true;
	const ownedByApp = data?.source === "paradev";

	const version = data?.version;
	const account = data?.account;
	const parts: string[] = [];
	if (!installed) {
		parts.push(t`Not installed`);
	} else {
		parts.push(version ? t`Installed · ${version}` : t`Installed`);
		if (!ownedByApp) parts.push(t`your own install`);
		parts.push(
			data?.signedIn
				? account
					? t`signed in as ${account}`
					: t`signed in`
				: t`not signed in`,
		);
	}

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center justify-between gap-8">
				<div className="min-w-0 space-y-0.5">
					<Label className="text-sm font-medium">{name}</Label>
					<div className="text-xs text-muted-foreground">
						{status.isPending ? (
							<Skeleton className="h-3 w-40" />
						) : (
							parts.join(" · ")
						)}
					</div>
				</div>
				{!status.isPending && step === null && (
					<div className="flex shrink-0 items-center gap-2">
						{installed && !data?.signedIn && (
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
			</div>
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
