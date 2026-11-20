import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";

export function CloudSignInPrompt({
	open,
	agentLabel,
	localAccountLabel,
	onSetUp,
	onNotNow,
	onOpenChange,
}: {
	open: boolean;
	agentLabel: string;
	localAccountLabel: string | null;
	onSetUp: () => void;
	onNotNow: () => void;
	onOpenChange: (open: boolean) => void;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						<Trans>Set up {agentLabel} for cloud workspaces?</Trans>
					</DialogTitle>
					<DialogDescription>
						{localAccountLabel ? (
							<Trans>
								{agentLabel} is signed in on this machine as {localAccountLabel}
								, but not in cloud workspaces. Sign in once for cloud so agents
								start ready.
							</Trans>
						) : (
							<Trans>
								{agentLabel} is not signed in for cloud workspaces yet. Sign in
								once so agents start ready.
							</Trans>
						)}
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant="ghost" onClick={onNotNow}>
						<Trans>Not now</Trans>
					</Button>
					<Button onClick={onSetUp}>
						<Trans>Set up</Trans>
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
