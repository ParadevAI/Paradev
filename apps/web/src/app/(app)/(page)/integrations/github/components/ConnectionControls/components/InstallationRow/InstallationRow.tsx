"use client";

import { Trans } from "@lingui/react/macro";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@superset/ui/alert-dialog";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Unplug } from "lucide-react";
import { useRouter } from "next/navigation";
import { FaGithub } from "react-icons/fa";
import { useTRPC } from "@/trpc/react";

interface InstallationRowProps {
	organizationId: string;
	installation: {
		id: string;
		accountLogin: string;
		accountType: string;
		suspended: boolean;
	};
}

export function InstallationRow({
	organizationId,
	installation,
}: InstallationRowProps) {
	const trpc = useTRPC();
	const router = useRouter();
	const queryClient = useQueryClient();

	const disconnectMutation = useMutation(
		trpc.integration.github.disconnect.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: trpc.integration.github.listRepositories.queryKey({
						organizationId,
					}),
				});
				router.refresh();
			},
		}),
	);

	const accountLogin = installation.accountLogin;

	return (
		<div className="flex items-center justify-between rounded-lg border p-3">
			<div className="flex items-center gap-3">
				<FaGithub className="size-5" />
				<div>
					<p className="font-medium">{accountLogin}</p>
					<p className="text-sm text-muted-foreground">
						{installation.accountType === "User" ? (
							<Trans>Personal account</Trans>
						) : (
							<Trans>Organization</Trans>
						)}
					</p>
				</div>
				{installation.suspended && (
					<Badge variant="destructive">
						<Trans>Suspended</Trans>
					</Badge>
				)}
			</div>
			<AlertDialog>
				<AlertDialogTrigger asChild>
					<Button
						variant="outline"
						size="sm"
						disabled={disconnectMutation.isPending}
					>
						<Unplug className="mr-2 size-4" />
						{disconnectMutation.isPending ? (
							<Trans>Disconnecting...</Trans>
						) : (
							<Trans>Disconnect</Trans>
						)}
					</Button>
				</AlertDialogTrigger>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							<Trans>Disconnect {accountLogin}?</Trans>
						</AlertDialogTitle>
						<AlertDialogDescription>
							<Trans>
								Repositories from {accountLogin} will stop syncing. Other
								connected GitHub accounts are not affected. The GitHub App stays
								installed on {accountLogin}, and you can reconnect at any time.
							</Trans>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>
							<Trans>Cancel</Trans>
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={() =>
								disconnectMutation.mutate({
									organizationId,
									installationId: installation.id,
								})
							}
						>
							<Trans>Disconnect</Trans>
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
