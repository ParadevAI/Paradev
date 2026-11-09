import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { Progress } from "@superset/ui/progress";
import { toast } from "@superset/ui/sonner";
import { X } from "lucide-react";
import {
	progressPercent,
	useWorkspaceMoveProgressStore,
	type WorkspaceMoveProgress,
} from "../../stores/workspaceMoveProgressStore";

const FINISHED = new Set(["ready", "partial", "failed"]);

export function WorkspaceMoveToast({ moveId }: { moveId: string }) {
	const { t } = useLingui();
	const move = useWorkspaceMoveProgressStore((state) => state.moves[moveId]);
	const remove = useWorkspaceMoveProgressStore((state) => state.remove);
	if (!move) return null;
	const finished = FINISHED.has(move.stage);
	const { name, destination } = move;

	const title =
		move.stage === "failed"
			? t({ message: `Couldn't move ${name}` })
			: finished
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
				{finished && (
					<button
						type="button"
						onClick={dismiss}
						aria-label={t({ message: "Dismiss" })}
						className="text-muted-foreground transition-colors hover:text-foreground"
					>
						<X className="size-3.5" />
					</button>
				)}
			</div>
			<p className="mt-1 text-xs text-muted-foreground" aria-live="polite">
				{describe(move, t)}
			</p>
			{move.stage !== "failed" && (
				<Progress className="mt-3 h-1.5" value={progressPercent(move)} />
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
		case "failed":
			return move.error ?? t({ message: "Unknown error" });
	}
}
