import { Trans } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import type {
	SuggestionKeyDownProps,
	SuggestionProps,
} from "@tiptap/suggestion";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type {
	RecordMentionItem,
	RecordMentionListComponent,
	RecordMentionListRef,
} from "renderer/components/MarkdownEditor/components/RecordMention";
import { useListCursor } from "renderer/hooks/useListCursor";
import { SlackPersonRow } from "../../../SlackPersonRow";
import type { SlackMember } from "./types";

/**
 * Slack's @ picker for the composer. The editor knows mentions only by id
 * and name, so the list looks each person up in the thread's members, which
 * the composer keeps current through `members`.
 */
export function createSlackMentionList(members: {
	current: ReadonlyMap<string, SlackMember>;
}): RecordMentionListComponent {
	const List = forwardRef<
		RecordMentionListRef,
		SuggestionProps<RecordMentionItem>
	>(({ items, command }, ref) => {
		const container = useRef<HTMLDivElement>(null);
		const people = items.flatMap((item) => {
			const person = item.kind === "person" && members.current.get(item.id);
			return person ? [{ item, person }] : [];
		});

		const {
			highlighted: selected,
			move,
			hover: setSelected,
		} = useListCursor(people.length, items);
		useEffect(() => {
			container.current
				?.querySelector(`[data-index="${selected}"]`)
				?.scrollIntoView({ block: "nearest" });
		}, [selected]);

		useImperativeHandle(ref, () => ({
			onKeyDown: ({ event }: SuggestionKeyDownProps) => {
				if (move(event.key)) return true;
				if (people.length === 0) return false;
				if (event.key === "Enter" || event.key === "Tab") {
					const row = people[selected];
					if (row) command(row.item);
					return true;
				}
				return false;
			},
		}));

		return (
			<div
				ref={container}
				role="listbox"
				className="max-h-80 w-[28rem] overflow-y-auto rounded-lg border border-border bg-popover py-2 text-sm text-popover-foreground shadow-lg"
			>
				{people.length === 0 ? (
					<div className="px-3.5 py-1.5 text-muted-foreground">
						<Trans>No matches</Trans>
					</div>
				) : (
					people.map(({ item, person }, index) => (
						<button
							type="button"
							role="option"
							aria-selected={index === selected}
							key={person.id}
							data-index={index}
							onMouseEnter={() => setSelected(index)}
							onClick={() => command(item)}
							className={cn(
								"flex h-8 w-full items-center gap-2 px-3.5 text-left",
								index === selected && "bg-fill-selected",
							)}
						>
							<SlackPersonRow person={person} />
						</button>
					))
				)}
			</div>
		);
	});
	List.displayName = "SlackMentionList";
	return List;
}
