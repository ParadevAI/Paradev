import { Image } from "expo-image";
import { CircleAlert, X } from "lucide-react-native";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ComposerAttachment } from "../../Composer.types";
import { COMPOSER_COLORS, COMPOSER_METRICS } from "../../constants";
import { FileCardContent } from "./components/FileCardContent";

interface ComposerAttachmentTrayProps {
	attachments: ComposerAttachment[];
	onPress: (attachment: ComposerAttachment) => void;
	onRemove: (id: string) => void;
}

export function ComposerAttachmentTray({
	attachments,
	onPress,
	onRemove,
}: ComposerAttachmentTrayProps) {
	return (
		<ScrollView
			horizontal
			keyboardShouldPersistTaps="always"
			showsHorizontalScrollIndicator={false}
			contentContainerStyle={styles.content}
		>
			{attachments.map((attachment) => {
				const uploading =
					attachment.progress !== undefined && !attachment.failed;
				return (
					<View key={attachment.id} style={styles.item}>
						<Pressable
							accessibilityRole="button"
							accessibilityLabel={attachment.name}
							onPress={() => onPress(attachment)}
							style={[
								styles.thumb,
								attachment.kind === "file" && styles.fileCard,
							]}
						>
							{attachment.kind === "image" ? (
								<Image
									source={{ uri: attachment.uri }}
									contentFit="cover"
									style={[StyleSheet.absoluteFill, uploading && styles.dimmed]}
								/>
							) : (
								<FileCardContent uri={attachment.uri} name={attachment.name} />
							)}
							{uploading ? (
								<View style={styles.badgeCenter}>
									<Text style={styles.progress}>
										{Math.round((attachment.progress ?? 0) * 100)}%
									</Text>
								</View>
							) : null}
							{attachment.failed ? (
								<View style={styles.badgeCenter}>
									<CircleAlert color={COMPOSER_COLORS.destructive} size={22} />
								</View>
							) : null}
						</Pressable>
						<Pressable
							accessibilityRole="button"
							hitSlop={8}
							onPress={() => onRemove(attachment.id)}
							style={styles.remove}
						>
							<X color={COMPOSER_COLORS.foreground} size={12} strokeWidth={3} />
						</Pressable>
					</View>
				);
			})}
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	content: {
		gap: COMPOSER_METRICS.gap,
		paddingHorizontal: COMPOSER_METRICS.edgeInset,
		paddingTop: 10,
	},
	item: { paddingTop: 4, paddingRight: 4 },
	thumb: {
		width: COMPOSER_METRICS.thumbSize,
		height: COMPOSER_METRICS.thumbSize,
		borderRadius: 10,
		overflow: "hidden",
		backgroundColor: COMPOSER_COLORS.control,
		alignItems: "center",
		justifyContent: "center",
	},
	fileCard: {
		width: COMPOSER_METRICS.thumbSize * 2,
		alignItems: "flex-start",
		justifyContent: "space-between",
		padding: 8,
	},
	dimmed: { opacity: 0.4 },
	badgeCenter: {
		...StyleSheet.absoluteFill,
		alignItems: "center",
		justifyContent: "center",
	},
	progress: {
		color: COMPOSER_COLORS.foreground,
		fontSize: 12,
		fontWeight: "600",
	},
	remove: {
		position: "absolute",
		top: 0,
		right: 0,
		width: 20,
		height: 20,
		borderRadius: 10,
		backgroundColor: "#525252",
		alignItems: "center",
		justifyContent: "center",
	},
});
