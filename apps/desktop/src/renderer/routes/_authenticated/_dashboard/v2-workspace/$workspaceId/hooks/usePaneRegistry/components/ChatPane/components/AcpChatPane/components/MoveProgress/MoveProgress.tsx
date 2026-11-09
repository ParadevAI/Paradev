import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { Check, Circle, Loader2 } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { resolveHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { useRelayUrl } from "renderer/hooks/useRelayUrl";
import { cloudTrpc, cloudTrpcClient } from "renderer/lib/cloud-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { describeMoveError } from "renderer/routes/_authenticated/_dashboard/utils/describeMoveError";
import { runMoveOnComputer } from "renderer/routes/_authenticated/_dashboard/utils/runMoveOnComputer";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useMissedReads } from "./hooks/useMissedReads";
import { useMoveArrival } from "./hooks/useMoveArrival";

const STEPS = ["pending", "copying", "restoring"] as const;
const POLL_MS = 2_000;
/** About a minute of reads that find no move here. */
const MAX_MISSED_READS = 30;
// Longer than the control plane waits for `teleport.continueChat`.
const ARRIVAL_GRACE_MS = 35_000;

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
	const navigate = useNavigate();
	const utils = cloudTrpc.useUtils();
	const relayUrl = useRelayUrl();
	const lostRef = useRef(false);
	const {
		data: latest,
		dataUpdatedAt,
		errorUpdatedAt,
		refetch,
	} = cloudTrpc.chatMove.latest.useQuery(
		{ chatSessionId },
		{
			refetchInterval: (query) =>
				lostRef.current || isSettledHere(query.state.data, workspaceId)
					? false
					: POLL_MS,
			refetchIntervalInBackground: false,
		},
	);
	// Until this move is recorded, the newest one is an earlier move elsewhere.
	const move = latest?.toWorkspaceId === workspaceId ? latest : null;
	const messageCount = move?.messageCount ?? 0;
	// A newer move out of this workspace means the chat arrived here and left again.
	const movedOn = latest?.fromWorkspaceId === workspaceId;
	const ready = move?.status === "ready" || movedOn;
	const { missed, reset: resetMissed } = useMissedReads(
		!!move || movedOn,
		Math.max(dataUpdatedAt, errorUpdatedAt),
	);
	const lost = missed >= MAX_MISSED_READS;
	lostRef.current = lost;
	const origin = move ? move.fromWorkspaceId : homeOf(latest);
	const openOrigin =
		origin && origin !== workspaceId
			? () => void navigateToV2Workspace(origin, navigate)
			: null;
	useMoveArrival({
		ready,
		live: sessionLive,
		graceMs: arrivalGraceMs,
		pollMs: POLL_MS,
		onCheck: onCheckSession,
		onArrived,
	});
	const { activeHostUrl, machineId, activeOrganizationId } =
		useLocalHostService();
	// A move here that no run on this computer has taken yet, as after a reload.
	const waitingHere =
		move?.status === "pending" && !!machineId && move.toHostId === machineId;
	const pickedUp = useRef<string | null>(null);
	useEffect(() => {
		if (!waitingHere || !move || !activeHostUrl) return;
		if (pickedUp.current === move.id) return;
		pickedUp.current = move.id;
		void runMoveOnComputer({
			moveId: move.id,
			host: getHostServiceClientByUrl(activeHostUrl),
		})
			.catch((error: unknown) =>
				console.warn("[chat-move] the move to this computer failed", error),
			)
			.finally(() => utils.chatMove.latest.invalidate({ chatSessionId }));
	}, [waitingHere, move, activeHostUrl, utils, chatSessionId]);
	const retry = cloudTrpc.chatMove.retry.useMutation({
		onSuccess: ({ moveId, runsOnThisComputer }) => {
			void utils.chatMove.latest.invalidate({ chatSessionId });
			void utils.workspaceMove.latest.invalidate({ workspaceId });
			if (!runsOnThisComputer) return;
			const toHostId = move?.toHostId ?? machineId;
			const hostUrl =
				toHostId && activeOrganizationId
					? resolveHostUrl({
							hostId: toHostId,
							machineId,
							activeHostUrl,
							organizationId: activeOrganizationId,
							relayUrl,
						})
					: null;
			if (!hostUrl) {
				void cloudTrpcClient.chatMove.fail
					.mutate({
						moveId,
						error:
							toHostId === machineId
								? "This computer's host is not running"
								: "The computer this chat moves to can't be reached",
					})
					.catch((error: unknown) =>
						console.warn(
							`[chat-move] could not record that move ${moveId} failed`,
							error,
						),
					)
					.finally(() => utils.chatMove.latest.invalidate({ chatSessionId }));
				return;
			}
			void runMoveOnComputer({
				moveId,
				host: getHostServiceClientByUrl(hostUrl),
			})
				.catch((error: unknown) =>
					console.warn("[chat-move] the move to the computer failed", error),
				)
				.finally(() => utils.chatMove.latest.invalidate({ chatSessionId }));
		},
		onError: (error) =>
			toast.error(t({ message: "Couldn't try the move again" }), {
				description: errorMessage(error, t({ message: "Unknown error" })),
			}),
	});

	const originButton = openOrigin ? (
		<Button size="sm" variant="outline" onClick={openOrigin}>
			<Trans>Open the original workspace</Trans>
		</Button>
	) : null;

	if (move?.status === "failed") {
		const failure = describeMoveError(move.error);
		return (
			<div className="flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-center">
				<p className="max-w-sm text-muted-foreground text-sm">
					<Trans>
						This chat couldn't move here. It is still in the workspace it came
						from.
					</Trans>
				</p>
				<p className="max-w-sm text-muted-foreground text-sm">
					{failure.reason}
				</p>
				{failure.details && (
					<details className="max-w-lg text-[11px] text-muted-foreground/60">
						<summary className="cursor-pointer select-none">
							<Trans>Details</Trans>
						</summary>
						<p className="mt-1 font-mono break-words">{failure.details}</p>
					</details>
				)}
				<div className="flex gap-2">
					{originButton}
					<Button
						size="sm"
						disabled={retry.isPending}
						onClick={() => retry.mutate({ moveId: move.id })}
					>
						<Trans>Try again</Trans>
					</Button>
				</div>
			</div>
		);
	}

	if (lost && !ready) {
		return (
			<div className="flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-center">
				<p className="max-w-sm text-muted-foreground text-sm">
					<Trans>
						Couldn't find how this chat's move is going. If it didn't move, it
						is still in the workspace it came from.
					</Trans>
				</p>
				<div className="flex gap-2">
					{originButton}
					<Button
						size="sm"
						onClick={() => {
							resetMissed();
							void refetch();
						}}
					>
						<Trans>Check again</Trans>
					</Button>
				</div>
			</div>
		);
	}

	const current = ready ? STEPS.length : stepIndex(move);
	const labels: Record<(typeof STEPS)[number], ReactNode> = {
		pending: move?.toHostId ? (
			<Trans>Getting the computer ready</Trans>
		) : (
			<Trans>Starting the workspace</Trans>
		),
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
			{openOrigin ? (
				<button
					type="button"
					onClick={openOrigin}
					className="text-muted-foreground text-xs underline-offset-2 hover:text-foreground hover:underline"
				>
					<Trans>Open the original workspace</Trans>
				</button>
			) : null}
		</div>
	);
}

/** Where the chat lives by its newest move recorded elsewhere. */
function homeOf(
	move:
		| { status: string; toWorkspaceId: string; fromWorkspaceId: string | null }
		| null
		| undefined,
): string | null {
	if (!move) return null;
	return move.status === "ready" ? move.toWorkspaceId : move.fromWorkspaceId;
}

function stepIndex(move: { status: string } | null | undefined): number {
	const index = STEPS.indexOf(move?.status as (typeof STEPS)[number]);
	return index === -1 ? 0 : index;
}

function isSettledHere(
	move:
		| { status: string; toWorkspaceId: string; fromWorkspaceId: string | null }
		| null
		| undefined,
	workspaceId: string,
): boolean {
	if (move?.fromWorkspaceId === workspaceId) return true;
	return (
		move?.toWorkspaceId === workspaceId &&
		(move.status === "ready" || move.status === "failed")
	);
}
