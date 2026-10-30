import type { LegendListProps } from "@legendapp/list/react-native";
import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { ArrowDownIcon } from "lucide-react-native";
import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
} from "react";
import { View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useResolveClassNames } from "uniwind";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { ConversationList } from "./conversation-list";
import type { ConversationListHandle } from "./conversation-list.types";

interface ConversationContextType {
	isAtBottom: boolean;
	scrollToBottom: () => void;
}

const ConversationContext = createContext<ConversationContextType | null>(null);

export const useConversation = () => {
	const context = useContext(ConversationContext);

	if (!context) {
		throw new Error("Conversation components must be used within Conversation");
	}

	return context;
};

export type ConversationProps<ItemT> = Omit<
	LegendListProps<ItemT>,
	"children" | "data" | "renderItem"
> & {
	data: readonly ItemT[];
	renderItem: LegendListProps<ItemT>["renderItem"];
	className?: string;
	contentContainerClassName?: string;
	children?: React.ReactNode;
};

export const Conversation = <ItemT,>({
	data,
	renderItem,
	className,
	contentContainerClassName,
	contentContainerStyle,
	onScroll,
	children,
	...listProps
}: ConversationProps<ItemT>) => {
	const listRef = useRef<ConversationListHandle>(null);
	const [isAtBottom, setIsAtBottom] = useState(true);
	const resolvedContentContainerStyle = useResolveClassNames(
		contentContainerClassName ?? "",
	);

	const scrollToBottom = useCallback(() => {
		listRef.current?.scrollToEnd({ animated: true });
	}, []);

	const contextValue = useMemo(
		() => ({ isAtBottom, scrollToBottom }),
		[isAtBottom, scrollToBottom],
	);

	return (
		<ConversationContext.Provider value={contextValue}>
			<View className={cn("relative flex-1", className)}>
				<ConversationList
					data={data}
					renderItem={renderItem}
					{...listProps}
					contentContainerStyle={
						contentContainerClassName
							? [resolvedContentContainerStyle, contentContainerStyle]
							: contentContainerStyle
					}
					onAtBottomChange={setIsAtBottom}
					onScroll={onScroll}
					ref={listRef}
				/>
				{children}
			</View>
		</ConversationContext.Provider>
	);
};

export type ConversationEmptyStateProps = React.ComponentProps<typeof View> & {
	title?: string;
	description?: string;
	icon?: React.ReactNode;
};

export const ConversationEmptyState = ({
	className,
	title = "No messages yet",
	description = "Start a conversation to see messages here",
	icon,
	children,
	...props
}: ConversationEmptyStateProps) => (
	<View
		className={cn(
			"size-full flex-1 flex-col items-center justify-center gap-3 p-8",
			className,
		)}
		{...props}
	>
		{children ?? (
			<>
				{icon && <View className="text-muted-foreground">{icon}</View>}
				<View className="items-center gap-1">
					<Text className="text-center font-medium text-sm">{title}</Text>
					{description && (
						<Text className="text-center text-muted-foreground text-sm">
							{description}
						</Text>
					)}
				</View>
			</>
		)}
	</View>
);

export type ConversationScrollButtonProps = ButtonProps;

export const ConversationScrollButton = ({
	className,
	children,
	...props
}: ConversationScrollButtonProps) => {
	const { isAtBottom, scrollToBottom } = useConversation();

	if (isAtBottom) {
		return null;
	}

	return (
		<Animated.View
			className="absolute right-0 bottom-4 left-0 items-center"
			entering={FadeIn.duration(150)}
			exiting={FadeOut.duration(150)}
			pointerEvents="box-none"
		>
			<Button
				accessibilityLabel={i18n._(
					msg({
						message: "Scroll to bottom",
					}),
				)}
				className={cn("rounded-full", className)}
				onPress={scrollToBottom}
				size="icon"
				variant="outline"
				{...props}
			>
				{children ?? <Icon as={ArrowDownIcon} className="size-4" />}
			</Button>
		</Animated.View>
	);
};
