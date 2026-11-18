import type { I18n } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
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
	const { t, i18n } = useLingui();
	const move = useWorkspaceMoveProgressStore((state) => state.moves[moveId]);
	const remove = useWorkspaceMoveProgressStore((state) => state.remove);
	if (!move) return null;
	const ended = ENDED.has(move.stage);
	const { name, destination } = move;
	// Chats that did not arrive show their own reason in their pane.
	const failure =
		move.stage === "failed" && move.failedDuring !== "moving-chats"
			? describeMoveError(move.error)
			: null;
	const retry = failure ? move.retry : null;
	const openable = move.open !== null && !failure && ended;

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
				{failure ? failure.reason : describe(move, i18n)}
			</p>
			{failure && (
				<p className="mt-1 text-xs text-muted-foreground">
					{describeOutcome(move, i18n)}
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
			{ended && !failure && move.stayed.length > 0 && (
				<p className="mt-1 truncate text-xs text-muted-foreground/70">
					{move.stage === "ready"
						? move.stayed.join(", ")
						: `${stayedSentence(move.stayed.length, i18n)} ${move.stayed.join(", ")}`}
				</p>
			)}
			{ended && !failure && move.stayedTerminals.length > 0 && (
				<p className="mt-1 truncate text-xs text-muted-foreground/70">
					{move.stage === "ready"
						? move.stayedTerminals.join(", ")
						: `${stayedTerminalsSentence(move.stayedTerminals.length, i18n)} ${move.stayedTerminals.join(", ")}`}
				</p>
			)}
			{ended && !failure && move.notRestartedTerminals.length > 0 && (
				<p className="mt-1 truncate text-xs text-muted-foreground/70">
					{move.notRestartedTerminals.join(", ")}
				</p>
			)}
			{!ended && (
				<Progress className="mt-3 h-1.5" value={progressPercent(move)} />
			)}
			{((move.cancel && CANCELLABLE.has(move.stage)) || retry || openable) && (
				<div className="mt-3 flex justify-end gap-2">
					{move.cancel && CANCELLABLE.has(move.stage) && (
						<Button size="sm" variant="outline" onClick={move.cancel}>
							<Trans>Cancel move</Trans>
						</Button>
					)}
					{retry && (
						<Button size="sm" onClick={retry}>
							<Trans>Try again</Trans>
						</Button>
					)}
					{openable && move.open && (
						<Button size="sm" onClick={move.open}>
							<Trans>Open</Trans>
						</Button>
					)}
				</div>
			)}
		</div>
	);
}

function describeOutcome(move: WorkspaceMoveProgress, i18n: I18n): string {
	const { name } = move;
	if (move.failedDuring === "creating") {
		return i18n._(
			msg({
				message: `${name} is unchanged. If an agent was working, it was stopped.`,
			}),
		);
	}
	return i18n._(
		msg({
			message: `${name} is unchanged. If an agent was working, it may have been stopped.`,
		}),
	);
}

function describe(move: WorkspaceMoveProgress, i18n: I18n): string {
	const chats = move.chats;
	switch (move.stage) {
		case "saving":
			return i18n._(msg({ message: "Saving its work and its chats…" }));
		case "creating":
			return i18n._(msg({ message: "Setting up the new workspace…" }));
		case "moving-chats": {
			if (!chats || chats.total === 0) {
				return i18n._(msg({ message: "Finishing the move…" }));
			}
			const done = chats.ready + chats.failed;
			if (done === 0) {
				return move.toCloud
					? i18n._(msg({ message: "Starting the cloud workspace…" }))
					: i18n._(
							msg({
								message: plural(chats.total, {
									one: "Moving its chat…",
									other: "Moving its chats…",
								}),
							}),
						);
			}
			return i18n._(
				msg({
					message: plural(chats.total, {
						one: `${done} of # chat moved`,
						other: `${done} of # chats moved`,
					}),
				}),
			);
		}
		case "ready":
			if (move.terminalsPending) {
				return i18n._(msg({ message: "Moving its terminals…" }));
			}
			if (move.stayed.length > 0) {
				return stayedSentence(move.stayed.length, i18n);
			}
			if (move.notRestartedTerminals.length > 0) {
				return notRestartedTerminalsSentence(
					move.notRestartedTerminals.length,
					i18n,
				);
			}
			if (move.stayedTerminals.length > 0) {
				return stayedTerminalsSentence(move.stayedTerminals.length, i18n);
			}
			return i18n._(msg({ message: "Everything moved." }));
		case "partial":
			return i18n._(
				msg({
					message: plural(chats?.failed ?? 0, {
						one: "# chat could not move. Open it to try again.",
						other: "# chats could not move. Open them to try again.",
					}),
				}),
			);
		case "cancelled":
			return i18n._(
				msg({
					message: `${move.name} stays where it was. If an agent was working, it may have been stopped.`,
				}),
			);
		case "unverified":
			return i18n._(
				msg({
					message:
						"Open the new workspace to see each chat. A chat that didn't move is still in the original workspace.",
				}),
			);
		case "failed":
			return i18n._(
				msg({
					message:
						"Its chats didn't move and are still in the original workspace. Open the new workspace to see why and try again.",
				}),
			);
	}
}

function stayedSentence(count: number, i18n: I18n): string {
	return i18n._(
		msg({
			message: plural(count, {
				one: "# chat stayed in the old workspace.",
				other: "# chats stayed in the old workspace.",
			}),
		}),
	);
}

function stayedTerminalsSentence(count: number, i18n: I18n): string {
	return i18n._(
		msg({
			message: plural(count, {
				one: "# terminal stayed in the old workspace.",
				other: "# terminals stayed in the old workspace.",
			}),
		}),
	);
}

function notRestartedTerminalsSentence(count: number, i18n: I18n): string {
	return i18n._(
		msg({
			message: plural(count, {
				one: "# terminal stopped and could not start again.",
				other: "# terminals stopped and could not start again.",
			}),
		}),
	);
}
