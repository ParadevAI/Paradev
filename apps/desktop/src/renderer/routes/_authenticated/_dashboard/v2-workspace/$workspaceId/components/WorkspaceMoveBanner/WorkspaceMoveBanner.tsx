import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useNavigate } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { type ReactNode, useState } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
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
	const cloudEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.CLOUD_WORKSPACES);
	const { data: move } = cloudTrpc.workspaceMove.latest.useQuery(
		{ workspaceId },
		{
			enabled: !!cloudEnabled,
			refetchInterval: (query) =>
				query.state.data && IN_FLIGHT.has(query.state.data.status)
					? POLL_MS
					: false,
		},
	);
	if (!move || move.id === dismissed) return null;

	const inFlight = IN_FLIGHT.has(move.status);
	const isSource = move.fromWorkspaceId === workspaceId;
	const stayed = move.chats.total - move.chats.ready;
	let label: ReactNode = null;
	if (isSource) {
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
				<span className="truncate font-medium">{label}</span>
				{isSource && !inFlight ? (
					<button
						type="button"
						onClick={() =>
							void navigateToV2Workspace(move.toWorkspaceId, navigate)
						}
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
