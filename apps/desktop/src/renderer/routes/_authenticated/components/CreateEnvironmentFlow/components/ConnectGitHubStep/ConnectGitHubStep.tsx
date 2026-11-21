import { Trans } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import {
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Skeleton } from "@superset/ui/skeleton";
import { toast } from "@superset/ui/sonner";
import { HiOutlineArrowTopRightOnSquare } from "react-icons/hi2";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { ConnectionRow } from "./components/ConnectionRow";

interface ConnectGitHubStepProps {
	appAccountLogin: string | null;
	accountLogin: string | null;
	accountAvailable: boolean;
	isLoading: boolean;
	onInstallApp: () => void;
	onContinue: () => void;
	onCancel: () => void;
}

export function ConnectGitHubStep({
	appAccountLogin,
	accountLogin,
	accountAvailable,
	isLoading,
	onInstallApp,
	onContinue,
	onCancel,
}: ConnectGitHubStepProps) {
	const connectAccount = cloudTrpc.githubUser.connect.useMutation({
		onSuccess: ({ url }) => {
			window.open(url, "_blank");
		},
		onError: (error) => toast.error(errorMessage(error)),
	});

	return (
		<>
			<DialogHeader className="px-5 pt-5 pb-4 text-left">
				<DialogTitle className="text-base leading-tight">
					<Trans>Connect GitHub</Trans>
				</DialogTitle>
				<DialogDescription className="text-sm leading-snug">
					<Trans>
						Cloud environments check out your repositories from GitHub. Connect
						these first; you only do this once.
					</Trans>
				</DialogDescription>
			</DialogHeader>
			<div className="px-5 pb-5">
				{isLoading ? (
					<Skeleton className="h-36 w-full" />
				) : (
					<div className="divide-y divide-border rounded-md border border-border">
						<ConnectionRow
							action={
								<Button onClick={onInstallApp} size="sm" variant="outline">
									<HiOutlineArrowTopRightOnSquare className="size-4" />
									<Trans>Install</Trans>
								</Button>
							}
							connected={appAccountLogin !== null}
							detail={
								appAccountLogin ? (
									<Trans>Installed on {appAccountLogin}</Trans>
								) : (
									<Trans>
										Lets your organization list and clone repositories
									</Trans>
								)
							}
							title={<Trans>Paradev GitHub App</Trans>}
						/>
						{accountAvailable && (
							<ConnectionRow
								action={
									<Button
										disabled={connectAccount.isPending}
										onClick={() => connectAccount.mutate()}
										size="sm"
										variant="outline"
									>
										<Trans>Connect</Trans>
									</Button>
								}
								connected={accountLogin !== null}
								detail={
									accountLogin ? (
										<Trans>@{accountLogin}</Trans>
									) : (
										<Trans>
											Cloud workspaces commit, push and open pull requests as
											you
										</Trans>
									)
								}
								title={<Trans>Your GitHub account</Trans>}
							/>
						)}
					</div>
				)}
			</div>
			<DialogFooter className="items-center border-t border-border/70 bg-muted/20 px-5 py-3">
				<span className="flex-1 text-xs text-muted-foreground">
					{accountAvailable && accountLogin === null && (
						<Trans>
							Your account can be connected later in Settings → Connections
						</Trans>
					)}
				</span>
				<Button onClick={onCancel} size="sm" variant="ghost">
					<Trans>Cancel</Trans>
				</Button>
				<Button
					disabled={appAccountLogin === null}
					onClick={onContinue}
					size="sm"
				>
					<Trans>Continue</Trans>
				</Button>
			</DialogFooter>
		</>
	);
}
