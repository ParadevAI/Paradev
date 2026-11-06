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

interface CloudWorkspaceAccessConfirmDialogProps {
	open: boolean;
	targetEnabled: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
}

export function CloudWorkspaceAccessConfirmDialog({
	open,
	targetEnabled,
	onOpenChange,
	onConfirm,
}: CloudWorkspaceAccessConfirmDialogProps) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent className="max-w-[480px]">
				<AlertDialogHeader>
					<AlertDialogTitle>
						{targetEnabled ? (
							<Trans>Let your cloud workspaces reach this host?</Trans>
						) : (
							<Trans>Stop your cloud workspaces from reaching this host?</Trans>
						)}
					</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className="space-y-3 text-sm text-muted-foreground">
							{targetEnabled ? (
								<p>
									<Trans>
										Anything running in a cloud workspace you created can then
										create workspaces, start agents, and run commands on this
										host, including an agent following instructions it found in
										a web page or a repository. Turn this on only if you need
										it.
									</Trans>
								</p>
							) : (
								<p>
									<Trans>
										Your cloud workspaces will no longer be able to reach this
										host.
									</Trans>
								</p>
							)}
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
						<Trans>Cancel</Trans>
					</Button>
					<Button
						variant={targetEnabled ? "destructive" : "default"}
						size="sm"
						onClick={onConfirm}
					>
						{targetEnabled ? <Trans>Allow</Trans> : <Trans>Turn off</Trans>}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
