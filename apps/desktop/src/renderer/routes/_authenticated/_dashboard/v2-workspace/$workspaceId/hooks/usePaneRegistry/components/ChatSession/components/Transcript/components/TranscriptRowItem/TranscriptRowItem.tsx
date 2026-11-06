import { MessageScroller } from "@superset/chat-ui/MessageScroller";
import { memo } from "react";
import {
	TurnGroupSection,
	type TurnGroupSectionProps,
} from "../TurnGroupSection";

type TranscriptRowItemProps = TurnGroupSectionProps & {
	className: string;
	messageId: string;
	rendered: boolean;
	rowRef: (element: HTMLElement | null) => void;
};

function sameEmptyRow(
	previous: TranscriptRowItemProps,
	next: TranscriptRowItemProps,
): boolean {
	return (
		!previous.rendered &&
		!next.rendered &&
		previous.row.key === next.row.key &&
		previous.className === next.className &&
		previous.messageId === next.messageId &&
		previous.rowRef === next.rowRef
	);
}

function sameRow(
	previous: TranscriptRowItemProps,
	next: TranscriptRowItemProps,
): boolean {
	if (sameEmptyRow(previous, next)) return true;
	const keys = Object.keys(next) as (keyof TranscriptRowItemProps)[];
	return (
		keys.length === Object.keys(previous).length &&
		keys.every((key) => Object.is(previous[key], next[key]))
	);
}

export const TranscriptRowItem = memo(function TranscriptRowItem({
	className,
	messageId,
	rendered,
	rowRef,
	...section
}: TranscriptRowItemProps) {
	return (
		<MessageScroller.Item
			className={className}
			messageId={messageId}
			ref={rowRef}
		>
			{rendered && <TurnGroupSection {...section} />}
		</MessageScroller.Item>
	);
}, sameRow);
