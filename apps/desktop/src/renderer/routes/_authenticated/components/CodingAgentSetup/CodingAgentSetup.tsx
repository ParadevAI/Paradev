import { useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { AgentInstallProgress } from "./components/AgentInstallProgress";
import { AgentSignInWaiting } from "./components/AgentSignInWaiting";
import type { CodingAgentId } from "./constants";

export type CodingAgentSetupStep = "install" | "sign-in";

interface CodingAgentSetupProps {
	agent: CodingAgentId;
	step: CodingAgentSetupStep;
	onInstalled: () => void;
	onSignedIn: () => void;
	onCancel: () => void;
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
	const status = electronTrpc.codingAgents.status.useQuery({ agent });

	const refresh = async () => {
		await utils.codingAgents.status.invalidate();
		return utils.codingAgents.status.fetch({ agent }).catch(() => null);
	};

	const installed = async () => {
		await refresh();
		onInstalled();
	};

	if (step === "install") {
		return (
			<AgentInstallProgress
				key={attempt}
				agent={agent}
				onInstalled={() => void installed()}
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
		<AgentSignInWaiting
			key={attempt}
			agent={agent}
			binaryPath={status.data?.path ?? null}
			onSignedIn={() => {
				void refresh().then(onSignedIn);
			}}
			onRetry={() => setAttempt((prev) => prev + 1)}
			onCancel={onCancel}
		/>
	);
}
