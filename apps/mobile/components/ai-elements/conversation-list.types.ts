import type { LegendListProps } from "@legendapp/list/react-native";
import type { ReactElement, Ref } from "react";

export interface ConversationListHandle {
	scrollToEnd: (options: { animated: boolean }) => void;
}

export type ConversationListProps<ItemT> = Omit<
	LegendListProps<ItemT>,
	"children" | "data" | "renderItem" | "onScroll" | "ref"
> & {
	data: readonly ItemT[];
	renderItem: LegendListProps<ItemT>["renderItem"];
	onScroll?: LegendListProps<ItemT>["onScroll"];
	/** Reports whether the list is pinned to its newest item. */
	onAtBottomChange: (atBottom: boolean) => void;
	ref?: Ref<ConversationListHandle>;
};

/** The scrolling list of a conversation, newest item last. */
export type ConversationListComponent = <ItemT>(
	props: ConversationListProps<ItemT>,
) => ReactElement;
