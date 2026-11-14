import {
	Column,
	Host,
	Icon,
	ListItem,
	ModalBottomSheet,
	type ModalBottomSheetRef,
	Text,
} from "@expo/ui/jetpack-compose";
import { clickable, padding } from "@expo/ui/jetpack-compose/modifiers";
import { useLingui } from "@lingui/react/macro";
import { useRef } from "react";
import { useWindowDimensions } from "react-native";
import { useComposeHostTheme } from "@/hooks/useComposeHostTheme";
import { MENU_ICON } from "@/lib/menu-icons";
import {
	settleAttachmentsSheet,
	useAttachmentsSheetRequest,
} from "./AttachmentsSheet";
import type {
	AttachmentsSheetAction,
	AttachmentsSheetHostComponent,
} from "./AttachmentsSheet.types";

export const AttachmentsSheetHost: AttachmentsSheetHostComponent = () => {
	const handlers = useAttachmentsSheetRequest();
	const sheetRef = useRef<ModalBottomSheetRef>(null);
	const hostTheme = useComposeHostTheme();
	const { width } = useWindowDimensions();
	const { t } = useLingui();
	if (!handlers) return null;

	const rows: { action: AttachmentsSheetAction; label: string }[] = [
		{ action: "photos", label: t({ message: "Photos" }) },
		{ action: "camera", label: t({ message: "Camera" }) },
		{ action: "files", label: t({ message: "Files" }) },
	];

	const dismiss = () => {
		settleAttachmentsSheet();
		handlers.onDismiss?.();
	};
	// The action runs once the sheet is gone, so a picker never opens under it.
	// Settling unmounts the sheet, so it hides first.
	const choose = async (action: AttachmentsSheetAction) => {
		await sheetRef.current?.hide().catch(() => {});
		settleAttachmentsSheet();
		handlers.onAction(action);
	};

	return (
		<Host
			{...hostTheme}
			style={{ position: "absolute", top: 0, bottom: 0, width }}
			pointerEvents="none"
		>
			<ModalBottomSheet
				ref={sheetRef}
				onDismissRequest={dismiss}
				skipPartiallyExpanded
			>
				<Column modifiers={[padding(0, 0, 0, 24)]}>
					{rows.map((row) => (
						<ListItem
							key={row.action}
							colors={{ containerColor: "transparent" }}
							modifiers={[clickable(() => void choose(row.action))]}
						>
							<ListItem.LeadingContent>
								<Icon source={MENU_ICON[row.action]} size={24} />
							</ListItem.LeadingContent>
							<ListItem.HeadlineContent>
								<Text>{row.label}</Text>
							</ListItem.HeadlineContent>
						</ListItem>
					))}
				</Column>
			</ModalBottomSheet>
		</Host>
	);
};
