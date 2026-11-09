import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { type ReactNode, useState } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useWorkspaceMoveProgressStore } from "renderer/routes/_authenticated/_dashboard/stores/workspaceMoveProgressStore";
import { MOVE_CANCELLED } from "renderer/routes/_authenticated/_dashboard/utils/describeMoveError";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";

const POLL_MS = 2_000;
const IN_FLIGHT = new Set(["pending", "moving"]);

/**
 * Where this workspace's newest move stands: on the workspace it left, that it
 * moved and where to; on the one it moved to, how many chats are still on
 * their way. Each moved chat's own pane shows its progress, failure and retry.
 */
export function WorkspaceMoveBanner({ workspaceId }: { workspaceId: string }) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const [dismissed, setDismissed] = useState<string | null>(null);
	const movesEnabled =
		useFeatureFlagEnabled(FEATURE_FLAGS.WORKSPACE_MOVES) === true;
	const utils = cloudTrpc.useUtils();
	const { data: move } = cloudTrpc.workspaceMove.latest.useQuery(
		{ workspaceId, anyone: true },
		{
			enabled: movesEnabled,
			refetchInterval: (query) =>
				query.state.data && IN_FLIGHT.has(query.state.data.status)
					? POLL_MS
					: false,
		},
	);
	const abandon = cloudTrpc.workspaceMove.abandon.useMutation({
		onSettled: () =>
			void utils.workspaceMove.latest.invalidate({ workspaceId }),
		onError: (error) =>
			toast.error(t({ message: "Couldn't cancel the move" }), {
				description: errorMessage(error, t({ message: "Unknown error" })),
			}),
	});
	const trackedHere = useWorkspaceMoveProgressStore((state) =>
		Object.values(state.moves).some(
			(progress) => move !== undefined && progress.workspaceMoveId === move?.id,
		),
	);
	if (!move || move.id === dismissed) return null;

	const inFlight = IN_FLIGHT.has(move.status);
	const destination = move.toWorkspaceId;
	const isMine = move.isMine !== false;
	// Only the workspace that moved says so; the new one shows its chats.
	if (move.fromWorkspaceId !== workspaceId) return null;
	// The mover's toast already says how it is going.
	if (inFlight && isMine && trackedHere) return null;
	// A move that never left is not news once its toast is gone.
	if (!inFlight && !destination) return null;
	// The box failed to start and no chat arrived: nothing moved.
	if (move.status === "failed" && move.chats.ready === 0) return null;
	const cancellable = isMine && move.status === "pending" && !destination;
	const cancel = () =>
		abandon.mutate({ workspaceMoveId: move.id, error: MOVE_CANCELLED });
	const stayed = move.chats.total - move.chats.ready;
	let label: ReactNode;
	if (inFlight) {
		label = isMine ? (
			<Trans>Moving this workspace…</Trans>
		) : (
			<Trans>Someone is moving this workspace…</Trans>
		);
	} else if (stayed === 0) {
		label = <Trans>This workspace moved</Trans>;
	} else {
		label = (
			<Plural
				value={move.chats.total - move.chats.ready}
				one="This workspace moved. Its # chat stayed here."
				other="This workspace moved. Its # chats stayed here."
			/>
		);
	}

	return (
		<div className="pointer-events-none absolute inset-x-0 top-20 z-20 flex justify-center px-4">
			<div
				aria-live="polite"
				className="pointer-events-auto flex max-w-full items-center gap-2.5 rounded-full border border-border bg-popover py-1.5 pr-1.5 pl-3 text-sm text-popover-foreground shadow-lg"
			>
				<span className="truncate font-medium">{label}</span>
				{cancellable ? (
					<button
						type="button"
						disabled={abandon.isPending}
						onClick={cancel}
						className="shrink-0 rounded-full bg-accent px-2.5 py-0.5 font-medium hover:bg-accent/70 disabled:opacity-50"
					>
						<Trans>Cancel move</Trans>
					</button>
				) : null}
				{!inFlight && destination ? (
					<button
						type="button"
						onClick={() => void navigateToV2Workspace(destination, navigate)}
						className="shrink-0 rounded-full bg-accent px-2.5 py-0.5 font-medium hover:bg-accent/70"
					>
						<Trans>Open</Trans>
					</button>
				) : null}
				{inFlight ? null : (
					<button
						type="button"
						aria-label={t({ message: "Dismiss" })}
						onClick={() => setDismissed(move.id)}
						className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
					>
						<X className="size-3.5" />
					</button>
				)}
			</div>
		</div>
	);
}
