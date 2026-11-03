import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { Check, Circle, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { runMoveOnThisComputer } from "../../../../utils/runMoveOnThisComputer";
import { useMoveArrival } from "./hooks/useMoveArrival";

const STEPS = ["pending", "copying", "restoring"] as const;
const POLL_MS = 1_000;
const ARRIVAL_GRACE_MS = 15_000;

/**
 * Where a chat moving into this workspace has got to, as the control plane
 * reports it. A failed move leaves the chat where it came from, so retrying
 * is always safe.
 */
export function MoveProgress({
	chatSessionId,
	workspaceId,
	sessionLive,
	onCheckSession,
	onArrived,
	arrivalGraceMs = ARRIVAL_GRACE_MS,
}: {
	chatSessionId: string;
	workspaceId: string;
	sessionLive: boolean;
	onCheckSession: () => void;
	onArrived: () => void;
	arrivalGraceMs?: number;
}) {
	const { t } = useLingui();
	const utils = cloudTrpc.useUtils();
	const { data: latest } = cloudTrpc.chatMove.latest.useQuery(
		{ chatSessionId },
		{ refetchInterval: POLL_MS, refetchIntervalInBackground: true },
	);
	// Until this move is recorded, the newest one is an earlier move elsewhere.
	const move = latest?.toWorkspaceId === workspaceId ? latest : null;
	const messageCount = move?.messageCount ?? 0;
	const ready = move?.status === "ready";
	useMoveArrival({
		ready,
		live: sessionLive,
		graceMs: arrivalGraceMs,
		pollMs: POLL_MS,
		onCheck: onCheckSession,
		onArrived,
	});
	const { activeHostUrl } = useLocalHostService();
	const retry = cloudTrpc.chatMove.retry.useMutation({
		onSuccess: ({ moveId, runsOnThisComputer }) => {
			void utils.chatMove.latest.invalidate({ chatSessionId });
			if (!runsOnThisComputer || !activeHostUrl) return;
			void runMoveOnThisComputer({
				moveId,
				host: getHostServiceClientByUrl(activeHostUrl),
			})
				.catch((error: unknown) =>
					console.warn("[chat-move] the move to this computer failed", error),
				)
				.finally(() => utils.chatMove.latest.invalidate({ chatSessionId }));
		},
		onError: (error) =>
			toast.error(t({ message: "Couldn't try the move again" }), {
				description: errorMessage(error, t({ message: "Unknown error" })),
			}),
	});

	if (move?.status === "failed") {
		return (
			<div className="flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-center">
				<p className="max-w-sm text-muted-foreground text-sm">
					<Trans>
						This chat couldn't move here. It is still in the workspace it came
						from.
					</Trans>
				</p>
				{move.error && (
					<p className="max-w-lg font-mono text-[11px] text-muted-foreground/60">
						{move.error}
					</p>
				)}
				<Button
					size="sm"
					disabled={retry.isPending}
					onClick={() => retry.mutate({ moveId: move.id })}
				>
					<Trans>Try again</Trans>
				</Button>
			</div>
		);
	}

	const current = ready ? STEPS.length : stepIndex(move);
	const labels: Record<(typeof STEPS)[number], ReactNode> = {
		pending: <Trans>Starting the workspace</Trans>,
		copying: move ? (
			<Plural
				value={messageCount}
				one="Copying the conversation (# message)"
				other="Copying the conversation (# messages)"
			/>
		) : (
			<Trans>Copying the conversation</Trans>
		),
		restoring: <Trans>Restoring Claude's session</Trans>,
	};
	return (
		<div className="flex h-full w-full flex-col items-center justify-center gap-4 p-8">
			<p className="text-sm">
				<Trans>Moving this chat here</Trans>
			</p>
			<ol className="flex flex-col gap-2" aria-live="polite">
				{STEPS.map((step, index) => (
					<li
						key={step}
						className={cn(
							"flex items-center gap-2 text-sm",
							index > current && "text-muted-foreground/60",
							index < current && "text-muted-foreground",
						)}
					>
						{index < current ? (
							<Check className="size-3.5" />
						) : index === current ? (
							<Loader2 className="size-3.5 animate-spin" />
						) : (
							<Circle className="size-3.5" />
						)}
						{labels[step]}
					</li>
				))}
			</ol>
		</div>
	);
}

function stepIndex(move: { status: string } | null | undefined): number {
	const index = STEPS.indexOf(move?.status as (typeof STEPS)[number]);
	return index === -1 ? 0 : index;
}
