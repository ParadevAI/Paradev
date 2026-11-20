import MenuView from "@expo/ui/community/menu";
import { View } from "react-native";
import { useUniwind } from "uniwind";
import { cn } from "@/lib/utils";
import { ValueMenuTrigger } from "./components/ValueMenuTrigger";
import type { ValueMenuComponent } from "./ValueMenu.types";

export const ValueMenu: ValueMenuComponent = ({
	a11yLabel,
	disabled = false,
	items,
	...trigger
}) => {
	const { theme } = useUniwind();
	const button = (
		<View
			accessible
			accessibilityRole="button"
			accessibilityLabel={a11yLabel}
			accessibilityState={{ disabled }}
			className={cn(
				"flex-row items-center gap-1",
				trigger.label === undefined && "size-9 justify-center",
				disabled && "opacity-50",
			)}
		>
			<ValueMenuTrigger {...trigger} />
		</View>
	);
	if (disabled) return button;
	return (
		<MenuView
			colorScheme={theme}
			actions={items.map((item) => ({
				id: item.key,
				title: item.label,
				state: item.checked ? "on" : "off",
			}))}
			onPressAction={({ nativeEvent }) =>
				items.find((item) => item.key === nativeEvent.event)?.onSelect()
			}
		>
			{button}
		</MenuView>
	);
};
