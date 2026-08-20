import Ionicons from "@expo/vector-icons/Ionicons";
import * as ImagePicker from "expo-image-picker";
import { Stack, useRouter } from "expo-router";
import { useEffect } from "react";
import { Alert, Pressable, View } from "react-native";
import {
	imageAssetToAttachment,
	usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { AddSelectedButton } from "./components/AddSelectedButton";
import { PhotoCarousel } from "./components/PhotoCarousel";
import { useAttachmentsSelectionStore } from "./stores/attachmentsSelectionStore";

export function AttachmentsScreen() {
	const router = useRouter();
	const theme = useTheme();
	const attachments = usePromptInputAttachments();
	const selected = useAttachmentsSelectionStore((store) => store.selected);
	const toggleAsset = useAttachmentsSelectionStore(
		(store) => store.toggleAsset,
	);
	const clear = useAttachmentsSelectionStore((store) => store.clear);

	useEffect(() => clear, [clear]);

	// Pickers present on top of this sheet; dismissing it first loses the
	// launch (the screen unmounts before its transition events fire).
	const closeAfter = async (pick: () => Promise<boolean>) => {
		if (await pick()) router.dismiss();
	};

	const openCamera = async () => {
		const permission = await ImagePicker.requestCameraPermissionsAsync();
		if (!permission.granted) {
			Alert.alert("Camera access is not allowed");
			return false;
		}
		let result: ImagePicker.ImagePickerResult;
		try {
			result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
		} catch {
			// Rejects where there is no camera (simulator).
			Alert.alert("Camera is not available");
			return false;
		}
		if (result.canceled) return false;
		const items = await Promise.all(result.assets.map(imageAssetToAttachment));
		attachments.add(items.filter((item) => item !== null));
		return true;
	};

	const mainRows = [
		{
			icon: "images-outline" as const,
			label: "Photos",
			onPress: () => void closeAfter(attachments.openImagePicker),
		},
		{
			icon: "scan-outline" as const,
			label: "Screenshots",
			onPress: () => router.push("/(authenticated)/attachments/screenshots"),
			showsChevron: true,
		},
		{
			icon: "camera-outline" as const,
			label: "Camera",
			onPress: () => void closeAfter(openCamera),
		},
		{
			icon: "document-outline" as const,
			label: "Files",
			onPress: () => void closeAfter(attachments.openFilePicker),
		},
	];

	return (
		<View className="bg-background flex-1">
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.Button icon="xmark" onPress={() => router.back()} />
			</Stack.Toolbar>
			{/* collapsable={false} keeps RN's view flattening from hoisting these
			    wrappers' children into the sheet container. react-native-screens
			    lays a formSheet out expecting at most 2 subviews next to a
			    ScrollView; flattened to 6 it mis-sizes the carousel's native
			    frames (SUPER-1199) while Yoga still reports correct boxes. */}
			<View className="pt-3" collapsable={false}>
				<PhotoCarousel selected={selected} onToggle={toggleAsset} />
				<View className="px-5 pt-4">
					{mainRows.map((row) => (
						<Pressable
							key={row.label}
							onPress={row.onPress}
							className="flex-row items-center gap-2.5 py-2.5"
						>
							<Ionicons
								name={row.icon}
								size={24}
								color={theme.mutedForeground}
							/>
							<Text
								className="flex-1 text-sm font-medium"
								style={{ color: theme.foreground }}
							>
								{row.label}
							</Text>
							{row.showsChevron ? (
								<Ionicons
									name="chevron-forward"
									size={16}
									color={theme.mutedForeground}
								/>
							) : null}
						</Pressable>
					))}
				</View>
			</View>
			<AddSelectedButton />
		</View>
	);
}
