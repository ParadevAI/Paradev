import { Trans, useLingui } from "@lingui/react/macro";
import { ShimmerLabel } from "@superset/ui/ai-elements/shimmer-label";
import { useNow } from "renderer/hooks/useNow";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { DevAvatar } from "renderer/routes/_authenticated/_dashboard/components/DevAvatar";
import type { ChannelMessage } from "renderer/routes/_authenticated/utils/channelMessageCache";
import type { DevFace } from "../../../../../../../ThreadMessage";
import { devPickupState, POSTED_WINDOW_MS } from "../../utils/devReplies";

const POLL_MS = 4_000;

interface DevPickupProps {
	devId: string;
	face: DevFace | undefined;
	/** The saved channel message the Dev was named in; null while it is on its way. */
	rootId: string | null;
	postedAt: number;
	replies: readonly ChannelMessage[];
	onOpenThread: (() => void) | undefined;
}

/**
 * A line for a named Dev that has not answered yet: on it, or why it never
 * will. Nothing once it answered or chose to stay quiet.
 */
export function DevPickup({
	devId,
	face,
	rootId,
	postedAt,
	replies,
	onOpenThread,
}: DevPickupProps) {
	const { t } = useLingui();
	const answered = replies.some((reply) => reply.authorId === devId);
	const fresh = Date.now() - postedAt < POSTED_WINDOW_MS;
	const activity = cloudTrpc.agent.activity.useQuery(
		{ agentId: devId },
		{
			enabled: rootId !== null && !answered,
			refetchInterval: (query) => {
				const turn = query.state.data?.turns.find(
					(candidate) => candidate.threadRootId === rootId,
				);
				return fresh && (!turn || turn.status === "running") ? POLL_MS : false;
			},
		},
	);
	const turn =
		activity.data?.turns.find(
			(candidate) => candidate.threadRootId === rootId,
		) ?? null;
	const dev = cloudTrpc.agent.get.useQuery(
		{ agentId: devId },
		{
			enabled: rootId !== null && !answered && turn === null,
			refetchInterval: fresh && turn === null ? POLL_MS : false,
		},
	);
	const now = useNow(POLL_MS, !answered && turn === null && fresh);
	const state = devPickupState({
		devId,
		replies,
		turnStatus: turn?.status ?? null,
		busy: dev.data?.working != null,
		postedAt,
		now: rootId === null ? postedAt : now.getTime(),
	});
	const name = face?.name ?? t({ message: "The Dev" });
	const avatar = face && <DevAvatar avatar={face.avatar} size={20} />;
	if (state === "answering") {
		return (
			<div className="flex items-center gap-2.5 text-[13px] text-muted-foreground">
				{avatar}
				<ShimmerLabel className="font-normal">
					{t({ message: `${name} is answering…` })}
				</ShimmerLabel>
			</div>
		);
	}
	if (state !== "missed" && state !== "failed") return null;
	const paused = dev.data?.pausedAt != null;
	return (
		<div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-muted-foreground">
			<span className="opacity-60 grayscale">{avatar}</span>
			<span>
				{state === "failed" ? (
					<Trans>{name} ran into a problem and didn't answer.</Trans>
				) : paused ? (
					<Trans>{name} is paused, so it didn't see this.</Trans>
				) : (
					<Trans>{name} didn't pick this up.</Trans>
				)}
			</span>
			{onOpenThread && (
				<button
					type="button"
					onClick={onOpenThread}
					className="font-medium text-link hover:underline"
				>
					<Trans>Open thread</Trans>
				</button>
			)}
		</div>
	);
}
