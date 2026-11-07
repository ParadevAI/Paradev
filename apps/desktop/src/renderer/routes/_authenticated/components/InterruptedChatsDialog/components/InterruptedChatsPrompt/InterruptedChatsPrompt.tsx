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
import { workspaceTrpc } from "@superset/workspace-client";
import { useState } from "react";

export function InterruptedChatsPrompt() {
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

	const pending = resume.isPending || keepPaused.isPending;
	const failed = resume.isError || keepPaused.isError;
	const answer = (action: typeof resume | typeof keepPaused) => {
		if (pending) return;
		action.mutate(undefined, { onSuccess: () => setAnswered(true) });
	};

	return (
		<AlertDialog
			open
			onOpenChange={(open) => {
				if (!open) answer(keepPaused);
			}}
		>
			<AlertDialogContent className="sm:max-w-[360px]">
				<form
					onSubmit={(event) => {
						event.preventDefault();
						answer(resume);
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
								one="This chat hadn't finished when Paradev closed"
								other="These chats hadn't finished when Paradev closed"
							/>
						</AlertDialogDescription>
						{failed && (
							<p className="text-destructive text-sm">
								<Trans>Something went wrong. Please try again.</Trans>
							</p>
						)}
					</AlertDialogHeader>
					<AlertDialogFooter className="mt-4">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							disabled={pending}
							onClick={() => answer(keepPaused)}
						>
							<Trans>Keep paused</Trans>
						</Button>
						<Button type="submit" size="sm" autoFocus disabled={pending}>
							<Trans>Resume</Trans>
						</Button>
					</AlertDialogFooter>
				</form>
			</AlertDialogContent>
		</AlertDialog>
	);
}
