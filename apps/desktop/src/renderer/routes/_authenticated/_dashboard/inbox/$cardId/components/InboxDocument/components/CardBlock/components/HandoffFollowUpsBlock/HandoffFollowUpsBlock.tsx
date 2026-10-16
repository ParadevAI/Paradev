import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { formatDateTime } from "@superset/i18n/format";
import { useState } from "react";
import { LuExternalLink, LuFileText } from "react-icons/lu";
import type { CardBlockViewProps, HandoffFollowUpsView } from "../../types";
import { fillClause, planSentence } from "../../utils/handoffPlan";
import { ActionButton } from "../ActionButton";
import {
	RoutedChecklist,
	routedSteps,
	routedValue,
	syncRouted,
} from "../RoutedChecklist";

const NOTHING_CHECKED = {};

/** Product names are never translated. */
const SOURCE_NAMES: Partial<Record<HandoffFollowUpsView["source"], string>> = {
	granola: "Granola",
	circleback: "Circleback",
};

/** A meeting's action items, each sent where it belongs: a Gmail draft, a Linear issue or a Slack message. */
export function HandoffFollowUpsBlock({
	view,
	actions,
	done,
	pending,
	failure,
	onAct,
}: CardBlockViewProps<"handoff.follow_ups">) {
	const { t } = useLingui();
	const { meeting, items } = view;
	const identity = [
		meeting.title,
		meeting.url,
		...items.map((item) => item.id),
	].join("\n");
	const progress = items
		.map(
			(item) =>
				`${item.done ? "done" : (item.unavailable ?? "")}:${item.destination?.kind}`,
		)
		.join("\n");
	const [value, setValue] = useState(() => routedValue(items));
	const [shown, setShown] = useState({ identity, progress });
	if (shown.identity !== identity) {
		setShown({ identity, progress });
		setValue(routedValue(items));
	} else if (shown.progress !== progress) {
		setShown({ identity, progress });
		setValue(syncRouted(items, value));
	}

	const action = (id: string) => actions.find((entry) => entry.id === id);
	const steps = routedSteps(items, value);
	const inputs = steps.flatMap((step) => (step.input ? [step.input] : []));
	const ready = steps.length > 0 && inputs.length === steps.length;
	const confirmText = planSentence(
		steps.map(({ item, payload }) =>
			fillClause(item.plan, {
				to: payload.kind === "gmail" ? payload.to.join(", ") : "",
				title: payload.kind === "linear" ? payload.draft.title.trim() : "",
			}),
		),
	);
	const routed = items.some((item) => item.done);

	return (
		<div className="flex flex-col">
			<div className="flex flex-col gap-1 border-b border-border px-4 py-3">
				<span className="text-sm font-medium text-foreground">
					{meeting.title}
				</span>
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
					<span className="inline-flex items-center gap-1.5">
						<LuFileText aria-hidden className="size-3.5" />
						{SOURCE_NAMES[view.source] ??
							t({ message: "Notes", context: "where meeting notes came from" })}
					</span>
					{meeting.heldAt && (
						<time dateTime={meeting.heldAt}>
							{formatDateTime(new Date(meeting.heldAt))}
						</time>
					)}
					{meeting.url && (
						<a
							href={meeting.url}
							target="_blank"
							rel="noreferrer"
							className="inline-flex items-center gap-1 text-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
						>
							<Trans>Open notes</Trans>
							<LuExternalLink className="size-3 opacity-60" />
						</a>
					)}
				</div>
			</div>
			<RoutedChecklist
				key={identity}
				items={items}
				compose={view.compose}
				value={done ? NOTHING_CHECKED : value}
				onChange={setValue}
				disabled={pending || done}
			/>
			{failure && (
				<p
					role="alert"
					className="border-t border-border px-4 py-3 text-xs text-destructive"
				>
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
						{routed ? (
							<Trans context="finish a card that is partly done">Done</Trans>
						) : (
							<Trans>Route nothing</Trans>
						)}
					</ActionButton>
					<ActionButton
						action={action("route")}
						pending={pending}
						disabled={!ready}
						confirmText={confirmText}
						onClick={() => ready && onAct("route", { items: inputs })}
					>
						<Plural
							value={steps.length}
							one="Route # item"
							other="Route # items"
						/>
					</ActionButton>
				</div>
			)}
		</div>
	);
}
