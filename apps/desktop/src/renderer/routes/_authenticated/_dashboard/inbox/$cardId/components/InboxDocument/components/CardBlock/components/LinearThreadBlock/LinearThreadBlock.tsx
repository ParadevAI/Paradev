import { useLingui } from "@lingui/react/macro";
import { useMemo, useState } from "react";
import { LuArrowUp } from "react-icons/lu";
import type { CardBlockViewProps } from "../../types";
import { ActionButton } from "../ActionButton";
import { LinearAvatar } from "../LinearAvatar";
import { LinearComposer } from "../LinearComposer";
import { LinearIssueHeader } from "../LinearIssueHeader";
import { LinearComment } from "./components/LinearComment";

/** One comment thread of a Linear issue as Linear's thread card: the root, its replies, reactions, and a reply box. */
export function LinearThreadBlock({
	view,
	actions,
	done,
	pending,
	failure,
	onAct,
}: CardBlockViewProps<"linear.thread">) {
	const { t } = useLingui();
	const [body, setBody] = useState(view.draft);
	const reply = actions.find((action) => action.id === "reply");
	const react = actions.find((action) => action.id === "react");
	const handles = useMemo(
		() => view.mentionable.map((person) => person.handle),
		[view.mentionable],
	);
	const canReact = !done && !pending && react && !react.disabled;
	const reactTo = (comment: string) =>
		canReact
			? (emoji: string, on: boolean) => onAct("react", { comment, emoji, on })
			: undefined;
	const text = body.trim();
	const send = () => {
		if (!text || pending || !reply || reply.disabled) return;
		onAct("reply", { body: text, root: view.root.id, seen: view.version });
	};
	return (
		<div
			data-linear-card
			tabIndex={-1}
			className="flex flex-col gap-3 px-4 py-3 outline-none"
		>
			<LinearIssueHeader issue={view.issue} />
			<div className="flex flex-col rounded-lg border border-border">
				<div className="p-3">
					<LinearComment
						comment={view.root}
						handles={handles}
						onReact={reactTo(view.root.id)}
					/>
				</div>
				{view.replies.map((comment) => (
					<div key={comment.id} className="border-t border-border p-3">
						<LinearComment
							comment={comment}
							handles={handles}
							reply
							onReact={reactTo(comment.id)}
						/>
					</div>
				))}
				{!done && reply && (
					<div className="flex items-end gap-2 border-t border-border p-3">
						<LinearAvatar person={view.account.viewer} className="mb-0.5" />
						<LinearComposer
							kind="reply"
							value={body}
							onChange={setBody}
							onSubmit={send}
							placeholder={t({ message: "Leave a reply…" })}
							mentionable={view.mentionable}
							disabled={pending || Boolean(reply.disabled)}
							className="flex-1"
						/>
						<ActionButton
							action={reply}
							pending={pending}
							disabled={!text}
							size="icon"
							variant="secondary"
							aria-label={t({ message: "Send reply" })}
							className="size-6 shrink-0 rounded-full"
							onClick={send}
						>
							<LuArrowUp className="size-3.5" />
						</ActionButton>
					</div>
				)}
			</div>
			{failure && (
				<p role="alert" className="text-xs text-destructive">
					{failure}
				</p>
			)}
		</div>
	);
}
