import { Trans } from "@lingui/react/macro";
import { useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	ToolInstallProgress,
	useToolInstallState,
} from "renderer/routes/_authenticated/components/ToolInstallProgress";
import { AgentSignInTerminal } from "./components/AgentSignInTerminal";
import {
	CODING_AGENT_MANUAL_INSTALL_URLS,
	CODING_AGENT_NAMES,
	CODING_AGENT_VENDORS,
	type CodingAgentId,
} from "./constants";

export type CodingAgentSetupStep = "install" | "sign-in";

interface CodingAgentSetupProps {
	agent: CodingAgentId;
	step: CodingAgentSetupStep;
	onInstalled: () => void;
	onSignedIn: () => void;
	onCancel: () => void;
}

function AgentInstall({
	agent,
	onInstalled,
	onRetry,
	onCheckAgain,
}: {
	agent: CodingAgentId;
	onInstalled: () => void;
	onRetry: () => void;
	onCheckAgain: () => Promise<boolean>;
}) {
	const install = useToolInstallState(onInstalled);
	electronTrpc.codingAgents.install.useSubscription(
		{ agent },
		{ onData: install.onData, onError: install.onError },
	);
	return (
		<ToolInstallProgress
			state={install.state}
			name={CODING_AGENT_NAMES[agent]}
			vendor={CODING_AGENT_VENDORS[agent]}
			manualInstall={{
				label: <Trans>Install it yourself</Trans>,
				url: CODING_AGENT_MANUAL_INSTALL_URLS[agent],
			}}
			onRetry={onRetry}
			onCheckAgain={onCheckAgain}
		/>
	);
}

/** The install or sign-in in progress for one agent, with its fallbacks. */
export function CodingAgentSetup({
	agent,
	step,
	onInstalled,
	onSignedIn,
	onCancel,
}: CodingAgentSetupProps) {
	const utils = electronTrpc.useUtils();
	const [attempt, setAttempt] = useState(0);

	const refresh = async () => {
		await utils.codingAgents.status.invalidate();
		return utils.codingAgents.status.fetch({ agent }).catch(() => null);
	};

	if (step === "install") {
		return (
			<AgentInstall
				key={attempt}
				agent={agent}
				onInstalled={() => void refresh().then(onInstalled)}
				onRetry={() => setAttempt((prev) => prev + 1)}
				onCheckAgain={async () => {
					const next = await refresh();
					if (!next?.installed) return false;
					onInstalled();
					return true;
				}}
			/>
		);
	}

	return (
		<AgentSignInTerminal
			key={attempt}
			agent={agent}
			onSignedIn={onSignedIn}
			onRetry={() => setAttempt((prev) => prev + 1)}
			onCancel={onCancel}
		/>
	);
}
