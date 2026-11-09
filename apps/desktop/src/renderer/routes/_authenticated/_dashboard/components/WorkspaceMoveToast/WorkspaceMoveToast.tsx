import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Progress } from "@superset/ui/progress";
import { toast } from "@superset/ui/sonner";
import { X } from "lucide-react";
import {
	progressPercent,
	useWorkspaceMoveProgressStore,
	type WorkspaceMoveProgress,
} from "../../stores/workspaceMoveProgressStore";
import { describeMoveError } from "../../utils/describeMoveError";

const ENDED = new Set([
	"ready",
	"partial",
	"failed",
	"cancelled",
	"unverified",
]);
const CANCELLABLE = new Set(["saving"]);

export function WorkspaceMoveToast({ moveId }: { moveId: string }) {
	const { t } = useLingui();
	const move = useWorkspaceMoveProgressStore((state) => state.moves[moveId]);
	const remove = useWorkspaceMoveProgressStore((state) => state.remove);
	if (!move) return null;
	const ended = ENDED.has(move.stage);
	const { name, destination } = move;
	const failure =
		move.stage === "failed" ? describeMoveError(move.error) : null;

	const title =
		move.stage === "failed"
			? t({ message: `Couldn't move ${name}` })
			: move.stage === "cancelled"
				? t({ message: `Stopped moving ${name}` })
				: move.stage === "unverified"
					? t({ message: "Couldn't check the move" })
					: ended
						? t({ message: `Moved ${name} to ${destination}` })
						: t({ message: `Moving ${name} to ${destination}` });

	const dismiss = () => {
		toast.dismiss(moveId);
		remove(moveId);
	};

	return (
		<div className="group/move-toast w-[356px] rounded-lg border border-border bg-popover p-4 shadow-lg select-text">
			<div className="flex items-start justify-between gap-2">
				<p className="min-w-0 truncate text-sm font-semibold text-popover-foreground">
					{title}
				</p>
				<button
					type="button"
					onClick={dismiss}
					aria-label={t({ message: "Dismiss" })}
					className="text-muted-foreground transition-colors hover:text-foreground"
				>
					<X className="size-3.5" />
				</button>
			</div>
			<p className="mt-1 text-xs text-muted-foreground" aria-live="polite">
				{failure ? failure.reason : describe(move, t)}
			</p>
			{move.stage === "failed" && (
				<p className="mt-1 text-xs text-muted-foreground">
					{describeOutcome(move, t)}
				</p>
			)}
			{failure?.details && (
				<details className="mt-2 text-[11px] text-muted-foreground/70">
					<summary className="cursor-pointer select-none">
						<Trans>Details</Trans>
					</summary>
					<p className="mt-1 font-mono break-words">{failure.details}</p>
				</details>
			)}
			{!ended && (
				<Progress className="mt-3 h-1.5" value={progressPercent(move)} />
			)}
			{((move.cancel && CANCELLABLE.has(move.stage)) ||
				(move.retry && move.stage === "failed")) && (
				<div className="mt-3 flex justify-end gap-2">
					{move.cancel && CANCELLABLE.has(move.stage) && (
						<Button size="sm" variant="outline" onClick={move.cancel}>
							<Trans>Cancel move</Trans>
						</Button>
					)}
					{move.retry && move.stage === "failed" && (
						<Button size="sm" onClick={move.retry}>
							<Trans>Try again</Trans>
						</Button>
					)}
				</div>
			)}
		</div>
	);
}

function describeChatCount(
	done: number,
	total: number,
	t: ReturnType<typeof useLingui>["t"],
): string {
	return t({
		message: plural(total, {
			one: `${done} of # chat moved`,
			other: `${done} of # chats moved`,
		}),
	});
}

function describeOutcome(
	move: WorkspaceMoveProgress,
	t: ReturnType<typeof useLingui>["t"],
): string {
	const { name } = move;
	if (move.failedDuring === "moving-chats") {
		return t({
			message: "Chats that didn't move are still in the original workspace.",
		});
	}
	if (move.failedDuring === "creating") {
		return t({
			message: `${name} is unchanged. If an agent was working, it was stopped.`,
		});
	}
	return t({ message: `${name} is unchanged.` });
}

function describe(
	move: WorkspaceMoveProgress,
	t: ReturnType<typeof useLingui>["t"],
): string {
	const chats = move.chats;
	switch (move.stage) {
		case "saving":
			return t({ message: "Saving its work and its chats…" });
		case "creating":
			return t({ message: "Setting up the new workspace…" });
		case "moving-chats":
			if (!chats || chats.total === 0) {
				return t({ message: "Finishing the move…" });
			}
			return describeChatCount(chats.ready + chats.failed, chats.total, t);
		case "ready":
			return t({ message: "Everything moved." });
		case "partial":
			return t({
				message: plural(chats?.failed ?? 0, {
					one: "# chat could not move. Open it to try again.",
					other: "# chats could not move. Open them to try again.",
				}),
			});
		case "cancelled":
			return t({
				message: `${move.name} stays where it was. If an agent was working, it may have been stopped.`,
			});
		case "unverified":
			return t({
				message:
					"Open the new workspace to see each chat. A chat that didn't move is still in the original workspace.",
			});
		case "failed":
			return describeMoveError(move.error).reason;
	}
}
