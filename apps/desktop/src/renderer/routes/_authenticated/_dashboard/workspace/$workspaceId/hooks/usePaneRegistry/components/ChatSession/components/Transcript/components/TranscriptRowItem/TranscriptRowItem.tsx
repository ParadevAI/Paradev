import { MessageScroller } from "@superset/chat-ui/MessageScroller";
import { memo, useCallback } from "react";
import {
	TurnGroupSection,
	type TurnGroupSectionProps,
} from "../TurnGroupSection";

type TranscriptRowItemProps = TurnGroupSectionProps & {
	className: string;
	messageId: string;
	rendered: boolean;
	registerRow: (rowKey: string, element: HTMLElement | null) => void;
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
		previous.registerRow === next.registerRow
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
	registerRow,
	...section
}: TranscriptRowItemProps) {
	const rowKey = section.row.key;
	const rowRef = useCallback(
		(element: HTMLElement | null) => registerRow(rowKey, element),
		[registerRow, rowKey],
	);
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
