import { Trans } from "@lingui/react/macro";
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
	onContinue: () => void;
}

export function SetupStepContinue({
	gitMissing,
	ghReady,
	onContinue,
}: SetupStepContinueProps) {
	const [confirmOpen, setConfirmOpen] = useState(false);

	if (!gitMissing && ghReady) {
		return (
			<Button size="sm" onClick={onContinue}>
				<Trans>Continue</Trans>
			</Button>
		);
	}

	return (
		<>
			<Button size="sm" onClick={() => setConfirmOpen(true)}>
				<Trans>Skip for now</Trans>
			</Button>
			<AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
				<AlertDialogContent className="sm:max-w-[400px]">
					<AlertDialogHeader>
						<AlertDialogTitle>
							{gitMissing ? (
								<Trans>Skip Git for now?</Trans>
							) : (
								<Trans>Skip GitHub for now?</Trans>
							)}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{gitMissing ? (
								<Trans>
									You can't add a project until Git is installed. The next
									screens will offer it again.
								</Trans>
							) : (
								<Trans>
									You can still clone public repos. Private repos and pull
									requests need GitHub connected. You can connect it later in
									Settings → Git & Worktrees.
								</Trans>
							)}
						</AlertDialogDescription>
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
