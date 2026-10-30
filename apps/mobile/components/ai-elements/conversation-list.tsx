import { LegendList, type LegendListRef } from "@legendapp/list/react-native";
import { useCallback, useImperativeHandle, useRef } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import type { ConversationListComponent } from "./conversation-list.types";

const AT_BOTTOM_THRESHOLD = 48;

export const ConversationList: ConversationListComponent = ({
	ref,
	onAtBottomChange,
	onScroll,
	...listProps
}) => {
	const listRef = useRef<LegendListRef>(null);
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
			// array) and `layout` covers keyboard/list resizes.
			maintainScrollAtEnd={{
				animated: false,
				on: { dataChange: true, layout: true },
			}}
			maintainScrollAtEndThreshold={0.15}
			recycleItems={false}
			{...listProps}
			onScroll={handleScroll}
			ref={listRef}
		/>
	);
};
