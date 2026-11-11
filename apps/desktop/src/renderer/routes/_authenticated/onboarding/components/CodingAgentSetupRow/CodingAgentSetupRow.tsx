import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { useState } from "react";
import { AgentIcon } from "renderer/components/AgentIcon";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	CODING_AGENT_NAMES,
	type CodingAgentId,
	CodingAgentSetup,
	type CodingAgentSetupStep,
	useAgentSignInState,
} from "renderer/routes/_authenticated/components/CodingAgentSetup";
import { SetupRow } from "../SetupRow";

interface CodingAgentSetupRowProps {
	agent: CodingAgentId;
}

export function CodingAgentSetupRow({ agent }: CodingAgentSetupRowProps) {
	const { t } = useLingui();
	const [step, setStep] = useState<CodingAgentSetupStep | null>(null);
	const { data: status } = electronTrpc.codingAgents.status.useQuery(
		{ agent },
		{ refetchOnWindowFocus: "always" },
	);
	const installed = status?.installed === true;
	const signIn = useAgentSignInState(agent, installed);
	const signedIn = installed && signIn.signedIn === true;
	const account = signIn.account;

	const signedOutDetail =
		agent === "claude"
			? t`Installed · sign in with your Claude account`
			: t`Installed · sign in with your ChatGPT account`;
	const detail = !status
		? t`Checking…`
		: step === "install"
			? t`Installing… Nothing else on your Mac changes.`
			: signedIn
				? account
					? t`Signed in as ${account}`
					: t`Signed in`
				: installed
					? signedOutDetail
					: t`Not installed · runs your chats and tasks`;

	return (
		<SetupRow
			icon={<AgentIcon presetId={agent} className="size-4" />}
			title={CODING_AGENT_NAMES[agent]}
			detail={detail}
			done={signedIn}
			actions={
				status &&
				step === null &&
				(installed ? (
					<Button size="sm" onClick={() => setStep("sign-in")}>
						<Trans>Sign in</Trans>
					</Button>
				) : (
					<Button size="sm" onClick={() => setStep("install")}>
						<Trans>Install</Trans>
					</Button>
				))
			}
			footer={
				step && (
					<CodingAgentSetup
						agent={agent}
						step={step}
						onInstalled={() => setStep(null)}
						onSignedIn={() => setStep(null)}
						onCancel={() => setStep(null)}
					/>
				)
			}
		/>
	);
}
