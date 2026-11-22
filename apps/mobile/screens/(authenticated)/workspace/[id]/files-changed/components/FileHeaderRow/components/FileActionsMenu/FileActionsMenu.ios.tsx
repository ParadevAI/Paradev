import {
	Host,
	Button as SwiftUIButton,
	Image as SwiftUIImage,
	Menu as SwiftUIMenu,
} from "@expo/ui/swift-ui";
import { useLingui } from "@lingui/react/macro";
import { useTheme } from "@/hooks/useTheme";
import type { FileActionsMenuComponent } from "./FileActionsMenu.types";

export const FileActionsMenu: FileActionsMenuComponent = ({
	onCopyPath,
	onViewFile,
	onAddComment,
	onDelete,
}) => {
	const { t } = useLingui();
	const theme = useTheme();
	return (
		<Host style={{ width: 32, height: 32 }}>
			<SwiftUIMenu
				label={
					<SwiftUIImage
						systemName="ellipsis"
						color={theme.mutedForeground}
						size={16}
					/>
				}
			>
				<SwiftUIButton
					label={t({
						message: "Copy relative path",
					})}
					systemImage="doc.on.doc"
					onPress={onCopyPath}
				/>
				<SwiftUIButton
					label={t({
						message: "View file",
					})}
					systemImage="doc.text"
					onPress={onViewFile}
				/>
				<SwiftUIButton
					label={t({
						message: "Add file comment",
					})}
					systemImage="text.bubble"
					onPress={onAddComment}
				/>
				{/* biome-ignore lint/a11y/useValidAriaRole: SwiftUI button role, not ARIA */}
				<SwiftUIButton
					label={t({
						message: "Delete file",
					})}
					systemImage="trash"
					role="destructive"
					onPress={onDelete}
				/>
			</SwiftUIMenu>
		</Host>
	);
};
