import { Plural, Trans } from "@lingui/react/macro";
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import {
	WorkspaceClientProvider,
	workspaceTrpc,
} from "@superset/workspace-client";
import { useState } from "react";
import {
	getHostServiceHeaders,
	getHostServiceWsToken,
} from "renderer/lib/host-service-auth";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

/** On launch, offers to resume the chats the last quit cut off mid-turn. */
export function InterruptedChatsDialog() {
	const { activeHostUrl } = useLocalHostService();
	if (!activeHostUrl) return null;
	return (
		<WorkspaceClientProvider
			cacheKey="interrupted-chats"
			key={activeHostUrl}
			hostUrl={activeHostUrl}
			headers={() => getHostServiceHeaders(activeHostUrl)}
			wsToken={() => getHostServiceWsToken(activeHostUrl)}
		>
			<InterruptedChatsDialogInner />
		</WorkspaceClientProvider>
	);
}

function InterruptedChatsDialogInner() {
	const [answered, setAnswered] = useState(false);
	// Hosts that predate the procedure answer with an error; that reads as none.
	const closed = workspaceTrpc.sessions.closedMidTurn.useQuery(undefined, {
		retry: false,
		staleTime: Number.POSITIVE_INFINITY,
		refetchOnWindowFocus: false,
	});
	const resume = workspaceTrpc.sessions.resumeClosedMidTurn.useMutation();
	const keepPaused =
		workspaceTrpc.sessions.keepClosedMidTurnPaused.useMutation();
	const count = closed.data?.length ?? 0;
	if (answered || count === 0) return null;

	const close = (action: () => void) => {
		setAnswered(true);
		action();
	};

	return (
		<AlertDialog
			open
			onOpenChange={(open) => {
				if (!open) close(() => keepPaused.mutate());
			}}
		>
			<AlertDialogContent className="sm:max-w-[360px]">
				<form
					onSubmit={(event) => {
						event.preventDefault();
						close(() => resume.mutate());
					}}
				>
					<AlertDialogHeader>
						<AlertDialogTitle>
							<Plural
								value={count}
								one="Resume # chat?"
								other="Resume # chats?"
							/>
						</AlertDialogTitle>
						<AlertDialogDescription>
							<Plural
								value={count}
								one="This chat was running when Paradev closed"
								other="These chats were running when Paradev closed"
							/>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter className="mt-4">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => close(() => keepPaused.mutate())}
						>
							<Trans>Keep paused</Trans>
						</Button>
						<Button type="submit" size="sm" autoFocus>
							<Trans>Resume</Trans>
						</Button>
					</AlertDialogFooter>
				</form>
			</AlertDialogContent>
		</AlertDialog>
	);
}
