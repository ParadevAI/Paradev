import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import { LuLoaderCircle } from "react-icons/lu";
import { useTerminalAgentBindings } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import {
	AgentSessionPicker,
	type AgentTarget,
	useAgentSessionTarget,
} from "renderer/routes/_authenticated/_dashboard/components/AgentSessionPicker";

export type { AgentTarget } from "renderer/routes/_authenticated/_dashboard/components/AgentSessionPicker";

interface PullRequestCommentComposerProps {
	/** Short description of what the comment is anchored to ("Line 42"),
	 *  shown in the composer header. */
	contextLabel: string;
	hostUrl: string;
	/** Workspace currently linked to this PR, if any — drives whether the
	 *  agent picker offers an already-running session. Null means no
	 *  workspace exists yet for this PR, so the picker only offers "start
	 *  new session" (which the submit handler turns into a full workspace
	 *  create, not just a new terminal in an existing one). */
	linkedWorkspaceId: string | null;
	onCancel: () => void;
	onPostComment?: (comment: string) => Promise<void>;
	onSubmit: (input: {
		comment: string;
		target: AgentTarget;
	}) => void | Promise<void>;
}

// A twin of the v2-workspace DiffPane's AgentCommentComposer: same popover
// chrome, agent-target picker, esc-to-dismiss, ⌘/Ctrl+Enter to submit — the
// PR Code tab has no fixed workspaceId to source sessions from (a PR may not
// have an open workspace at all yet), so `linkedWorkspaceId` is nullable and
// stands in for AgentCommentComposer's always-present `workspaceId`.
export function PullRequestCommentComposer({
	contextLabel,
	hostUrl,
	linkedWorkspaceId,
	onCancel,
	onPostComment,
	onSubmit,
}: PullRequestCommentComposerProps) {
	const { t } = useLingui();
	const bindings = useTerminalAgentBindings(linkedWorkspaceId ?? "", {
		enabled: linkedWorkspaceId != null,
	});
	const sessions = useMemo(
		() =>
			Array.from(bindings.values()).sort(
				(a, b) => b.lastEventAt - a.lastEventAt,
			),
		[bindings],
	);
	const { data: configs = [] } = useV2AgentConfigs(hostUrl);
	const { value, resolved, onValueChange } = useAgentSessionTarget({
		sessions,
		configs,
	});

	const [destination, setDestination] = useState<"github" | "agent">("github");
	const inFlight = useRef(false);
	const [comment, setComment] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		const el = textareaRef.current;
		if (!el) return;
		el.focus();
		const len = el.value.length;
		el.setSelectionRange(len, len);
	}, []);

	const canSubmit =
		comment.trim().length > 0 &&
		!submitting &&
		(destination === "github" || resolved != null);

	const handleSubmit = async () => {
		if (!canSubmit || inFlight.current) return;
		inFlight.current = true;
		setSubmitting(true);
		try {
			if (destination === "github") await onPostComment?.(comment.trim());
			else if (resolved)
				await onSubmit({ comment: comment.trim(), target: resolved });
		} catch (error) {
			// User-facing errors are the caller's responsibility (toasted from
			// the mutation's onError) — just don't let a rejection leak out of
			// this form's synchronous handlers.
			console.error("[PullRequestCommentComposer] submit failed", error);
		} finally {
			inFlight.current = false;
			setSubmitting(false);
		}
	};

	return (
		<form
			className="pr-diff-comment mx-3 my-1.5 overflow-hidden rounded-lg border border-border/80 bg-popover font-sans text-popover-foreground shadow-[0_4px_16px_-4px_rgba(0,0,0,0.12),0_2px_4px_-2px_rgba(0,0,0,0.06)]"
			onSubmit={(e) => {
				e.preventDefault();
				void handleSubmit();
			}}
			onKeyDown={(e) => {
				if (e.key === "Escape" && !submitting) {
					e.stopPropagation();
					onCancel();
				}
				if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canSubmit) {
					e.preventDefault();
					void handleSubmit();
				}
			}}
		>
			<div className="flex items-center justify-between px-3 pt-2 pb-1">
				<span className="min-w-0 truncate text-[11px] font-medium tracking-tight text-muted-foreground">
					{contextLabel}
				</span>
				<span className="text-[10px] tracking-tight text-muted-foreground/70">
					<Trans>esc to dismiss</Trans>
				</span>
			</div>
			<div className="flex gap-1 px-3 pb-2">
				<Button
					type="button"
					size="xs"
					variant={destination === "github" ? "secondary" : "ghost"}
					aria-pressed={destination === "github"}
					disabled={submitting}
					onClick={() => setDestination("github")}
				>
					<Trans>Comment on PR</Trans>
				</Button>
				<Button
					type="button"
					size="xs"
					variant={destination === "agent" ? "secondary" : "ghost"}
					aria-pressed={destination === "agent"}
					disabled={submitting}
					onClick={() => setDestination("agent")}
				>
					<Trans>Send to agent</Trans>
				</Button>
			</div>
			<div className="px-3 pb-2">
				<textarea
					ref={textareaRef}
					value={comment}
					onChange={(e) => setComment(e.target.value)}
					placeholder={
						destination === "github"
							? t({ message: "Write a comment…" })
							: t({ message: "Ask the AI…" })
					}
					aria-label={t({ message: "Comment" })}
					disabled={submitting}
					rows={3}
					className={cn(
						"block w-full resize-none bg-transparent text-[13px] leading-snug text-foreground",
						"placeholder:text-muted-foreground/60",
						"focus:outline-none focus-visible:outline-none",
					)}
				/>
			</div>
			<div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 bg-muted/30 px-2.5 py-1.5">
				{destination === "agent" && (
					<AgentSessionPicker
						workspaceId={linkedWorkspaceId}
						value={value}
						onValueChange={onValueChange}
						sessions={sessions}
						configs={configs}
					/>
				)}
				<div className="ml-auto flex items-center gap-1">
					<Button
						type="button"
						size="xs"
						variant="ghost"
						onClick={onCancel}
						disabled={submitting}
						className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
					>
						<Trans>Cancel</Trans>
					</Button>
					<Button
						type="submit"
						size="xs"
						disabled={!canSubmit}
						className="h-7 gap-1.5 px-2.5 text-[11px] font-medium disabled:opacity-40"
					>
						{submitting && <LuLoaderCircle className="size-3 animate-spin" />}
						<span>
							{submitting ? (
								<Trans>Sending…</Trans>
							) : destination === "github" ? (
								<Trans>Post comment</Trans>
							) : (
								<Trans>Send to agent</Trans>
							)}
						</span>
					</Button>
				</div>
			</div>
		</form>
	);
}
