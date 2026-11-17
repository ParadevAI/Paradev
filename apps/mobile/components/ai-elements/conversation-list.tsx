import { LegendList, type LegendListRef } from "@legendapp/list/react-native";
import { useCallback, useImperativeHandle, useRef, useState } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import type { ConversationListComponent } from "./conversation-list.types";

const AT_BOTTOM_THRESHOLD = 48;
const MAINTAIN_SCROLL_AT_END = {
	animated: false,
	on: { dataChange: true, layout: true },
};

export const ConversationList: ConversationListComponent = ({
	ref,
	onAtBottomChange,
	onScroll,
	onScrollBeginDrag,
	onScrollEndDrag,
	onTouchStart,
	onContentSizeChange,
	...listProps
}) => {
	const listRef = useRef<LegendListRef>(null);
	const [isDragging, setIsDragging] = useState(false);
	const touched = useRef(false);
	useImperativeHandle(ref, () => ({
		scrollToEnd: (options) => listRef.current?.scrollToEnd(options),
	}));

	const handleScroll = useCallback(
		(event: NativeSyntheticEvent<NativeScrollEvent>) => {
			const { contentOffset, contentSize, layoutMeasurement } =
				event.nativeEvent;
			const distanceFromBottom =
				contentSize.height - layoutMeasurement.height - contentOffset.y;
			onAtBottomChange(distanceFromBottom < AT_BOTTOM_THRESHOLD);
			onScroll?.(event);
		},
		[onAtBottomChange, onScroll],
	);

	const handleScrollBeginDrag = useCallback(
		(event: NativeSyntheticEvent<NativeScrollEvent>) => {
			setIsDragging(true);
			onScrollBeginDrag?.(event);
		},
		[onScrollBeginDrag],
	);

	const handleTouchStart = useCallback<NonNullable<typeof onTouchStart>>(
		(event) => {
			touched.current = true;
			onTouchStart?.(event);
		},
		[onTouchStart],
	);

	// Rows mount at estimated heights and grow as their markdown measures,
	// which maintainScrollAtEnd does not follow, so a thread that loads after
	// mount opened at its top. Follow that growth until the reader touches.
	const handleContentSizeChange = useCallback(
		(width: number, height: number) => {
			if (!touched.current) listRef.current?.scrollToEnd({ animated: false });
			onContentSizeChange?.(width, height);
		},
		[onContentSizeChange],
	);

	const handleScrollEndDrag = useCallback(
		(event: NativeSyntheticEvent<NativeScrollEvent>) => {
			setIsDragging(false);
			onScrollEndDrag?.(event);
		},
		[onScrollEndDrag],
	);

	return (
		// Not alignItemsAtEnd: bottom-anchoring short threads means ANY item
		// growth (expanding a tool card) shoves the whole thread upward.
		// Top-aligned short threads grow downward instead, so the tapped
		// trigger stays put; long threads are unaffected.
		<LegendList
			initialScrollAtEnd
			keyboardShouldPersistTaps="handled"
			// No `itemLayout` trigger on purpose: re-pinning when an item grows
			// makes expanding a collapsible (tool card) yank the whole list up,
			// so the chevron the user just tapped jumps away. Streaming still
			// sticks to bottom via `dataChange` (every chunk replaces the data
			// array) and `layout` covers keyboard/list resizes. Off while a
			// finger drags, or each chunk pulls the reader back down.
			maintainScrollAtEnd={isDragging ? false : MAINTAIN_SCROLL_AT_END}
			maintainScrollAtEndThreshold={0.15}
			recycleItems={false}
			{...listProps}
			onScroll={handleScroll}
			onScrollBeginDrag={handleScrollBeginDrag}
			onScrollEndDrag={handleScrollEndDrag}
			onTouchStart={handleTouchStart}
			onContentSizeChange={handleContentSizeChange}
			ref={listRef}
		/>
	);
};
