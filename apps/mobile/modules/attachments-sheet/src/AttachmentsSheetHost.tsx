import { useLingui } from "@lingui/react/macro";
import {
	Camera,
	FolderOpen,
	Images,
	type LucideIcon,
} from "lucide-react-native";
import { Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
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
	const insets = useSafeAreaInsets();
	const { t } = useLingui();
	if (!handlers) return null;

	const rows: {
		action: AttachmentsSheetAction;
		label: string;
		icon: LucideIcon;
	}[] = [
		{ action: "photos", label: t({ message: "Photos" }), icon: Images },
		{ action: "camera", label: t({ message: "Camera" }), icon: Camera },
		{ action: "files", label: t({ message: "Files" }), icon: FolderOpen },
	];

	const dismiss = () => {
		settleAttachmentsSheet();
		handlers.onDismiss?.();
	};

	return (
		<Modal
			transparent
			visible
			animationType="fade"
			statusBarTranslucent
			onRequestClose={dismiss}
		>
			<View className="flex-1 justify-end bg-black/60">
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={t({ message: "Close" })}
					className="absolute inset-0"
					onPress={dismiss}
				/>
				<View
					className="bg-popover border-border rounded-t-3xl border px-2 pt-3"
					style={{ paddingBottom: insets.bottom + 12 }}
				>
					{rows.map((row) => (
						<Pressable
							key={row.action}
							accessibilityRole="button"
							className="active:bg-accent flex-row items-center gap-4 rounded-2xl px-4 py-4"
							onPress={() => {
								settleAttachmentsSheet();
								handlers.onAction(row.action);
							}}
						>
							<Icon as={row.icon} className="text-foreground size-5" />
							<Text className="text-foreground text-base">{row.label}</Text>
						</Pressable>
					))}
				</View>
			</View>
		</Modal>
	);
};
