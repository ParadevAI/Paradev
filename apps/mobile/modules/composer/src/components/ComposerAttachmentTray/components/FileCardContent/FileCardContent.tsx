import { Image } from "expo-image";
import { FileText } from "lucide-react-native";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { COMPOSER_COLORS, COMPOSER_METRICS } from "../../../../constants";
import { fileThumbnail } from "../../../../utils/fileThumbnail";

const PREVIEW_HEIGHT = COMPOSER_METRICS.thumbSize - 16;

/** The first page when the platform can draw one, the glyph otherwise. */
export function FileCardContent({ uri, name }: { uri: string; name?: string }) {
	const preview = useFileThumbnail(uri);
	if (!preview) {
		return (
			<>
				<FileText color={COMPOSER_COLORS.muted} size={20} />
				<Text numberOfLines={2} style={styles.name}>
					{name}
				</Text>
			</>
		);
	}
	return (
		<View style={styles.row}>
			<Image
				source={{ uri: preview }}
				contentFit="contain"
				style={styles.preview}
			/>
			<Text numberOfLines={3} style={[styles.name, styles.nameBeside]}>
				{name}
			</Text>
		</View>
	);
}

function useFileThumbnail(uri: string) {
	const [preview, setPreview] = useState<string | null>(null);
	useEffect(() => {
		let live = true;
		setPreview(null);
		if (uri) {
			void fileThumbnail(uri, PREVIEW_HEIGHT).then(
				(result) => live && setPreview(result),
			);
		}
		return () => {
			live = false;
		};
	}, [uri]);
	return preview;
}

const styles = StyleSheet.create({
	row: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
	preview: {
		width: PREVIEW_HEIGHT * 0.75,
		height: PREVIEW_HEIGHT,
		borderRadius: 4,
	},
	name: { color: COMPOSER_COLORS.muted, fontSize: 11 },
	nameBeside: { flex: 1 },
});
