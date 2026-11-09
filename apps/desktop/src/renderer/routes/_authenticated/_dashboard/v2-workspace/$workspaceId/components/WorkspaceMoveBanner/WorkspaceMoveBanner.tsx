import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { type ReactNode, useState } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import {
	describeMoveError,
	MOVE_CANCELLED,
} from "renderer/routes/_authenticated/_dashboard/utils/describeMoveError";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";

const POLL_MS = 2_000;
const IN_FLIGHT = new Set(["pending", "moving"]);

/**
 * Where this workspace's newest move stands: on the workspace it left, that it
 * moved and where to; on the one it moved to, how many chats are still on
 * their way. Each moved chat's own pane shows its progress and retry.
 */
export function WorkspaceMoveBanner({ workspaceId }: { workspaceId: string }) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const [dismissed, setDismissed] = useState<string | null>(null);
	const movesEnabled =
		useFeatureFlagEnabled(FEATURE_FLAGS.WORKSPACE_MOVES) === true;
	const utils = cloudTrpc.useUtils();
	const { data: move } = cloudTrpc.workspaceMove.latest.useQuery(
		{ workspaceId },
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
	if (!move || move.id === dismissed) return null;

	const inFlight = IN_FLIGHT.has(move.status);
	const destination = move.toWorkspaceId;
	const isSource = move.fromWorkspaceId === workspaceId;
	const stayed = move.chats.total - move.chats.ready;
	const cancellable =
		isSource && move.status === "pending" && !move.toWorkspaceId;
	const failure =
		move.status === "failed" ? describeMoveError(move.error) : null;
	let label: ReactNode = null;
	if (failure) {
		label = isSource ? (
			<Trans>This workspace couldn't move. It is unchanged.</Trans>
		) : (
			<Trans>The move into this workspace failed.</Trans>
		);
	} else if (isSource) {
		if (inFlight) {
			label = <Trans>Moving this workspace…</Trans>;
		} else if (move.status === "ready") {
			label = <Trans>This workspace moved</Trans>;
		} else if (move.status === "partial") {
			label = (
				<Plural
					value={stayed}
					one="This workspace moved. # chat stayed here."
					other="This workspace moved. # chats stayed here."
				/>
			);
		}
	} else if (inFlight) {
		label =
			move.chats.total > 0 ? (
				<Plural
					value={move.chats.total - move.chats.ready - move.chats.failed}
					one="Moving # chat here…"
					other="Moving # chats here…"
				/>
			) : (
				<Trans>Moving this workspace here…</Trans>
			);
	} else if (move.status === "partial") {
		const { ready, total } = move.chats;
		label = t({ message: `${ready} of ${total} chats moved here` });
	}
	if (!label) return null;

	return (
		<div className="pointer-events-none absolute inset-x-0 top-20 z-20 flex justify-center px-4">
			<div
				aria-live="polite"
				className="pointer-events-auto flex max-w-full items-center gap-2.5 rounded-full border border-border bg-popover py-1.5 pr-1.5 pl-3 text-sm text-popover-foreground shadow-lg"
			>
				<span
					className="truncate font-medium"
					title={failure ? (failure.details ?? failure.reason) : undefined}
				>
					{label}
					{failure ? (
						<span className="ml-1.5 font-normal text-muted-foreground">
							{failure.reason}
						</span>
					) : null}
				</span>
				{cancellable ? (
					<button
						type="button"
						disabled={abandon.isPending}
						onClick={() =>
							abandon.mutate({
								workspaceMoveId: move.id,
								error: MOVE_CANCELLED,
							})
						}
						className="shrink-0 rounded-full bg-accent px-2.5 py-0.5 font-medium hover:bg-accent/70 disabled:opacity-50"
					>
						<Trans>Cancel move</Trans>
					</button>
				) : null}
				{isSource && !inFlight && destination ? (
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
