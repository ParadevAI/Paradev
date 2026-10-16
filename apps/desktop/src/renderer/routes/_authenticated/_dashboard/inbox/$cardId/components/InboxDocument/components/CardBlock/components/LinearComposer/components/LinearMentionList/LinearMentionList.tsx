import { cn } from "@superset/ui/utils";
import type {
	SuggestionKeyDownProps,
	SuggestionProps,
} from "@tiptap/suggestion";
import { forwardRef, useImperativeHandle } from "react";
import { useListCursor } from "renderer/hooks/useListCursor";
import type { LinearPersonView } from "../../../../types";
import { LinearAvatar } from "../../../LinearAvatar";

interface LinearMentionListRef {
	onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

/** Linear's @ menu: the people a comment can mention. */
export const LinearMentionList = forwardRef<
	LinearMentionListRef,
	SuggestionProps<LinearPersonView>
>(({ items, command }, ref) => {
	const { highlighted, move, hover } = useListCursor(items.length, items);
	useImperativeHandle(ref, () => ({
		onKeyDown: ({ event }) => {
			if (move(event.key)) return true;
			if (event.key !== "Enter" && event.key !== "Tab") return false;
			const person = items[highlighted];
			if (person) command(person);
			return items.length > 0;
		},
	}));
	if (items.length === 0) return null;
	return (
		<div
			role="listbox"
			className="max-h-72 w-64 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
		>
			{items.map((person, index) => (
				<button
					type="button"
					role="option"
					aria-selected={index === highlighted}
					key={person.id}
					onMouseEnter={() => hover(index)}
					onClick={() => command(person)}
					className={cn(
						"flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px]",
						index === highlighted && "bg-fill-hover",
					)}
				>
					<LinearAvatar person={person} className="size-4 text-[9px]" />
					<span className="truncate">{person.name}</span>
				</button>
			))}
		</div>
	);
});
LinearMentionList.displayName = "LinearMentionList";
