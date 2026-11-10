import { Trans } from "@lingui/react/macro";
import { formatList } from "@superset/i18n/format";
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { useState } from "react";

interface SetupStepContinueProps {
	gitMissing: boolean;
	ghReady: boolean;
	/** Names of the coding agents offered and not installed. */
	missingAgents?: string[];
	onContinue: () => void;
}

export function SetupStepContinue({
	gitMissing,
	ghReady,
	missingAgents = [],
	onContinue,
}: SetupStepContinueProps) {
	const [confirmOpen, setConfirmOpen] = useState(false);
	const agentsMissing = missingAgents.length > 0;

	if (!gitMissing && ghReady && !agentsMissing) {
		return (
			<Button size="sm" onClick={onContinue}>
				<Trans>Continue</Trans>
			</Button>
		);
	}

	const tools = formatList(["GitHub CLI", ...missingAgents]);
	const agents = formatList(missingAgents, { type: "disjunction" });
	const title = gitMissing ? (
		<Trans>Skip Git for now?</Trans>
	) : !ghReady && agentsMissing ? (
		<Trans>Skip setup for now?</Trans>
	) : !ghReady ? (
		<Trans>Skip GitHub for now?</Trans>
	) : (
		<Trans>Skip the coding agent for now?</Trans>
	);
	const description = gitMissing ? (
		<Trans>
			You can't add a project until Git is installed. The next screens will
			offer it again.
		</Trans>
	) : !ghReady && agentsMissing ? (
		<Trans>
			{tools} aren't set up yet. You can set them up later in Settings.
		</Trans>
	) : !ghReady ? (
		<Trans>
			You can still clone public repos. Private repos and pull requests need
			GitHub connected. You can connect it later in Settings → Git & Worktrees.
		</Trans>
	) : (
		<Trans>
			Chats and tasks need {agents}. You can install it later in Settings →
			Agents, or when you start your first chat.
		</Trans>
	);

	return (
		<>
			<Button size="sm" onClick={() => setConfirmOpen(true)}>
				<Trans>Skip for now</Trans>
			</Button>
			<AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
				<AlertDialogContent className="sm:max-w-[400px]">
					<AlertDialogHeader>
						<AlertDialogTitle>{title}</AlertDialogTitle>
						<AlertDialogDescription>{description}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<Button variant="outline" onClick={() => setConfirmOpen(false)}>
							<Trans>Go back</Trans>
						</Button>
						<Button
							onClick={() => {
								setConfirmOpen(false);
								onContinue();
							}}
						>
							<Trans>Skip</Trans>
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
