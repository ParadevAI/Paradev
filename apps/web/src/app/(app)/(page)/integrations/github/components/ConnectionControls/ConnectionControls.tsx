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
import { Plus, Unplug } from "lucide-react";
import { useRouter } from "next/navigation";
import { env } from "@/env";
import { useTRPC } from "@/trpc/react";

interface Installation {
	id: string;
	accountLogin: string;
	accountType: string;
	suspended: boolean;
}

interface ConnectionControlsProps {
	organizationId: string;
	installations: Installation[];
}

export function ConnectionControls({
	organizationId,
	installations,
}: ConnectionControlsProps) {
	const trpc = useTRPC();
	const router = useRouter();
	const queryClient = useQueryClient();

	const disconnectMutation = useMutation(
		trpc.integration.github.disconnect.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: trpc.integration.github.listInstallations.queryKey({
						organizationId,
					}),
				});
				router.refresh();
			},
		}),
	);

	const handleConnect = () => {
		window.location.href = `${env.NEXT_PUBLIC_API_URL}/api/github/install?organizationId=${organizationId}`;
	};

	return (
		<div className="space-y-4">
			{installations.length > 0 && (
				<ul className="divide-y rounded-lg border">
					{installations.map((installation) => (
						<li
							key={installation.id}
							className="flex items-center justify-between gap-4 p-3 text-sm"
						>
							<div className="flex items-center gap-2">
								<strong>{installation.accountLogin}</strong>
								<span className="text-muted-foreground">
									({installation.accountType})
								</span>
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
										<Trans>Disconnect</Trans>
									</Button>
								</AlertDialogTrigger>
								<AlertDialogContent>
									<AlertDialogHeader>
										<AlertDialogTitle>
											<Trans>Disconnect {installation.accountLogin}?</Trans>
										</AlertDialogTitle>
										<AlertDialogDescription>
											<Trans>
												Its repositories stop syncing, and environments and
												cloud workspaces built on them cannot start until it is
												connected again. The GitHub App stays installed on
												GitHub.
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
						</li>
					))}
				</ul>
			)}
			<Button
				onClick={handleConnect}
				variant={installations.length > 0 ? "outline" : "default"}
			>
				{installations.length > 0 ? (
					<>
						<Plus className="mr-2 size-4" />
						<Trans>Add another GitHub account</Trans>
					</>
				) : (
					<Trans>Install GitHub App</Trans>
				)}
			</Button>
		</div>
	);
}
