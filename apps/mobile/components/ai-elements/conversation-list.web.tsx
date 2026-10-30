import {
	type ComponentType,
	createElement,
	Fragment,
	isValidElement,
	type ReactElement,
	useCallback,
	useImperativeHandle,
	useRef,
} from "react";
import {
	type NativeScrollEvent,
	type NativeSyntheticEvent,
	ScrollView,
	type ScrollViewInstance,
} from "react-native";
import type { ConversationListComponent } from "./conversation-list.types";

const AT_BOTTOM_THRESHOLD = 48;

function slot(component: ComponentType | ReactElement | null | undefined) {
	if (!component) return null;
	return isValidElement(component) ? component : createElement(component);
}

/**
 * Every row stays in the DOM, so the browser anchors the scroll position and
 * streamed text re-renders. Any scroll up releases the pin; reaching the
 * bottom again restores it.
 */
export const ConversationList: ConversationListComponent = ({
	ref,
	data,
	renderItem,
	keyExtractor,
	ListHeaderComponent,
	ListFooterComponent,
	contentContainerStyle,
	keyboardDismissMode,
	onAtBottomChange,
	onScroll,
}) => {
	const scrollRef = useRef<ScrollViewInstance>(null);
	const pinned = useRef(true);
	const lastOffset = useRef(0);

	const setPinned = useCallback(
		(next: boolean) => {
			if (pinned.current === next) return;
			pinned.current = next;
			onAtBottomChange(next);
		},
		[onAtBottomChange],
	);

	useImperativeHandle(ref, () => ({
		scrollToEnd: (options) => {
			setPinned(true);
			scrollRef.current?.scrollToEnd(options);
		},
	}));

	const handleScroll = useCallback(
		(event: NativeSyntheticEvent<NativeScrollEvent>) => {
			const { contentOffset, contentSize, layoutMeasurement } =
				event.nativeEvent;
			const distanceFromBottom =
				contentSize.height - layoutMeasurement.height - contentOffset.y;
			const scrolledUp =
				contentOffset.y < lastOffset.current - 1 && distanceFromBottom > 1;
			lastOffset.current = contentOffset.y;
			setPinned(!scrolledUp && distanceFromBottom < AT_BOTTOM_THRESHOLD);
			onScroll?.(event);
		},
		[setPinned, onScroll],
	);

	const followContent = useCallback(() => {
		if (pinned.current) scrollRef.current?.scrollToEnd({ animated: false });
	}, []);

	return (
		<ScrollView
			ref={scrollRef}
			contentContainerStyle={contentContainerStyle}
			keyboardDismissMode={keyboardDismissMode}
			keyboardShouldPersistTaps="handled"
			onContentSizeChange={followContent}
			onLayout={followContent}
			onScroll={handleScroll}
			scrollEventThrottle={16}
		>
			{slot(ListHeaderComponent)}
			{data.map((item, index) => (
				<Fragment key={keyExtractor?.(item, index) ?? index}>
					{renderItem?.({
						item,
						index,
						data,
						extraData: undefined,
						type: undefined,
					})}
				</Fragment>
			))}
			{slot(ListFooterComponent)}
		</ScrollView>
	);
};
