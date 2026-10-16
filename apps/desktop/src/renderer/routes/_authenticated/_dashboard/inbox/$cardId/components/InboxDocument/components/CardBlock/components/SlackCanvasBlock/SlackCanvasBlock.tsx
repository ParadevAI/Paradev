import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import type { CardBlockViewProps, SlackCanvasView } from "../../types";
import { ActionButton } from "../ActionButton";
import { DescriptionDiff } from "../LinearEditBlock/components/DescriptionDiff";
import { LinearMarkdown } from "../LinearMarkdown";
import { SlackOpenLink } from "../SlackOpenLink";
import { canvasDiff } from "./utils/canvasDiff";

const MARKDOWN_MAX = 8000;

/** A change to a Slack canvas as a diff of the part it touches, with the whole canvas a click away. */
export function SlackCanvasBlock({
	view,
	actions,
	done,
	pending,
	failure,
	onAct,
}: CardBlockViewProps<"slack.canvas">) {
	const { t } = useLingui();
	const { canvas, change } = view;
	const [markdown, setMarkdown] = useState(view.after);
	const [editing, setEditing] = useState(false);
	const [whole, setWhole] = useState(false);
	const action = (id: string) => actions.find((entry) => entry.id === id);
	const labels: Record<SlackCanvasView["change"], string> = {
		replace: t({ message: "Replace", context: "a change to a canvas" }),
		insert_after: t({ message: "Add after" }),
		append: t({ message: "Add at the end" }),
		delete: t({ message: "Remove", context: "a change to a canvas" }),
	};
	const diff = canvasDiff(view, markdown);
	const title = canvas.title;
	const Chevron = whole ? LuChevronDown : LuChevronRight;

	return (
		<div className="flex flex-col">
			<div className="flex flex-col gap-3 px-4 py-3">
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
					<span className="min-w-0 truncate text-[13px] font-semibold text-foreground">
						{title}
					</span>
					<span className="flex-1" />
					{canvas.url && <SlackOpenLink href={canvas.url} />}
				</div>
				<div className="flex flex-col gap-1.5">
					<div className="flex items-center justify-between text-xs text-muted-foreground">
						<span data-change={change}>{labels[change]}</span>
						{!done && change !== "delete" && (
							<button
								type="button"
								disabled={pending}
								onClick={() => setEditing((on) => !on)}
								className="rounded px-1.5 py-0.5 font-medium text-foreground hover:bg-fill-hover"
							>
								{editing ? (
									<Trans context="finish editing a canvas change">Done</Trans>
								) : (
									<Trans>Edit</Trans>
								)}
							</button>
						)}
					</div>
					{editing && !done ? (
						<textarea
							value={markdown}
							disabled={pending}
							maxLength={MARKDOWN_MAX}
							aria-label={t({ message: "New text" })}
							rows={Math.min(Math.max(markdown.split("\n").length + 1, 4), 16)}
							onChange={(event) => setMarkdown(event.target.value)}
							className="resize-y rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs leading-relaxed text-foreground outline-none focus:border-foreground/40"
						/>
					) : (
						<DescriptionDiff before={diff.before} after={diff.after} />
					)}
				</div>
				<div className="flex flex-col gap-2">
					<button
						type="button"
						aria-expanded={whole}
						onClick={() => setWhole((on) => !on)}
						className="flex w-fit items-center gap-1 rounded text-xs font-medium text-muted-foreground hover:text-foreground"
					>
						<Chevron className="size-3.5" />
						<Trans>Show the whole canvas</Trans>
					</button>
					{whole && (
						<LinearMarkdown
							text={view.content}
							className="rounded-md border border-border px-3 py-2"
						/>
					)}
				</div>
			</div>
			{failure && (
				<p role="alert" className="px-4 pb-3 text-xs text-destructive">
					{failure}
				</p>
			)}
			{!done && (
				<div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">
					<ActionButton
						action={action("dismiss")}
						pending={pending}
						variant="outline"
						onClick={() => onAct("dismiss")}
					>
						<Trans>Leave the canvas</Trans>
					</ActionButton>
					<ActionButton
						action={action("apply")}
						pending={pending}
						disabled={change !== "delete" && markdown.trim() === ""}
						confirmText={t({ message: `Change "${title}" in Slack?` })}
						onClick={() =>
							onAct("apply", {
								markdown,
								section: view.section,
								before: view.before,
								version: view.version,
							})
						}
					>
						<Trans>Apply to canvas</Trans>
					</ActionButton>
				</div>
			)}
		</div>
	);
}
