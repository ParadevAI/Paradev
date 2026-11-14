import {
	Column,
	Host,
	ListItem,
	ModalBottomSheet,
	type ModalBottomSheetRef,
	Text,
} from "@expo/ui/jetpack-compose";
import { clickable, padding } from "@expo/ui/jetpack-compose/modifiers";
import { useRef } from "react";
import { useWindowDimensions } from "react-native";
import { useComposeHostTheme } from "@/hooks/useComposeHostTheme";
import { useTheme } from "@/hooks/useTheme";
import {
	settleActionSheet,
	useActionSheetRequest,
} from "../../actionSheetRequest";
import type { ActionSheetHostComponent } from "./ActionSheetHost.types";

export const ActionSheetHost: ActionSheetHostComponent = () => {
	const request = useActionSheetRequest();
	const sheetRef = useRef<ModalBottomSheetRef>(null);
	const hostTheme = useComposeHostTheme();
	const theme = useTheme();
	const { width } = useWindowDimensions();
	if (!request) return null;

	const { options, cancelButtonIndex, destructiveButtonIndex } =
		request.options;
	// The choice runs once the sheet is gone, so a screen it opens is not covered.
	const choose = async (index: number) => {
		await sheetRef.current?.hide().catch(() => {});
		settleActionSheet(index);
	};

	return (
		<Host
			{...hostTheme}
			style={{ position: "absolute", top: 0, bottom: 0, width }}
			pointerEvents="none"
		>
			<ModalBottomSheet
				ref={sheetRef}
				onDismissRequest={() => settleActionSheet()}
				skipPartiallyExpanded
			>
				<Column modifiers={[padding(0, 0, 0, 24)]}>
					{options.map((label, index) =>
						index === cancelButtonIndex ? null : (
							<ListItem
								key={label}
								colors={{ containerColor: "transparent" }}
								modifiers={[clickable(() => void choose(index))]}
							>
								<ListItem.HeadlineContent>
									<Text
										color={
											index === destructiveButtonIndex
												? theme.destructive
												: undefined
										}
									>
										{label}
									</Text>
								</ListItem.HeadlineContent>
							</ListItem>
						),
					)}
				</Column>
			</ModalBottomSheet>
		</Host>
	);
};
