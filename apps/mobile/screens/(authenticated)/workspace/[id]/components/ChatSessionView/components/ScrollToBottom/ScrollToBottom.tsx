import { useConversation } from "@/components/ai-elements/conversation";
import { ScrollToBottomButton } from "../../../ScrollToBottomButton";
import { DOCK_CHIP_HEIGHT } from "../DockChip";

export function ScrollToBottom() {
	const { isAtBottom, scrollToBottom } = useConversation();
	return (
		<ScrollToBottomButton
			className="bottom-2 items-end px-3"
			diameter={DOCK_CHIP_HEIGHT}
			onPress={scrollToBottom}
			systemName="chevron.down"
			visible={!isAtBottom}
		/>
	);
}
