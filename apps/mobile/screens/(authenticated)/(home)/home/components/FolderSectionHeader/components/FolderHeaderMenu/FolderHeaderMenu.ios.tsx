import {
	Host,
	Button as SwiftUIButton,
	Image as SwiftUIImage,
	Menu as SwiftUIMenu,
} from "@expo/ui/swift-ui";
import {
	accessibilityLabel,
	contentShape,
	frame,
	shapes,
} from "@expo/ui/swift-ui/modifiers";
import { useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { View } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { GROUP_COLORS } from "./constants";
import type { FolderHeaderMenuComponent } from "./FolderHeaderMenu.types";

export const FolderHeaderMenu: FolderHeaderMenuComponent = ({
	color,
	onRename,
	onSetColor,
	onDelete,
}) => {
	const { t } = useLingui();
	const theme = useTheme();
	return (
		<View className="size-9 items-center justify-center">
			<Host matchContents>
				<SwiftUIMenu
					modifiers={[accessibilityLabel(t({ message: "Group actions" }))]}
					label={
						<SwiftUIImage
							systemName="ellipsis"
							color={theme.mutedForeground}
							size={14}
							modifiers={[
								frame({ width: 36, height: 36 }),
								contentShape(shapes.rectangle()),
							]}
						/>
					}
				>
					<SwiftUIButton
						label={t({ message: "Rename group" })}
						systemImage="pencil"
						onPress={onRename}
					/>
					<SwiftUIMenu
						label={t({ message: "Set group color" })}
						systemImage="paintpalette"
					>
						<SwiftUIButton
							label={t({ message: "Default" })}
							systemImage={color === null ? "checkmark" : undefined}
							onPress={() => onSetColor(null)}
						/>
						{GROUP_COLORS.map((option) => (
							<SwiftUIButton
								key={option.value}
								label={i18n._(option.label)}
								systemImage={option.value === color ? "checkmark" : undefined}
								onPress={() => onSetColor(option.value)}
							/>
						))}
					</SwiftUIMenu>
					{/* biome-ignore lint/a11y/useValidAriaRole: SwiftUI button role, not ARIA */}
					<SwiftUIButton
						label={t({ message: "Delete group" })}
						systemImage="trash"
						role="destructive"
						onPress={onDelete}
					/>
				</SwiftUIMenu>
			</Host>
		</View>
	);
};
