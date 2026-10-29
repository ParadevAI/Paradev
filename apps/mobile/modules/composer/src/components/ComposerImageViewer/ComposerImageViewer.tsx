import { Image } from "expo-image";
import { X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Show = (uri: string) => void;

/** Mounted viewers, newest last: only the newest one opens. */
const viewers: Show[] = [];

/** Opens `uri` in the newest mounted viewer; false when none is mounted. */
export function showImage(uri: string): boolean {
	const show = viewers.at(-1);
	show?.(uri);
	return show !== undefined;
}

/**
 * The full-screen image viewer behind `presentImage`. A function cannot draw,
 * so each mounted composer hosts one.
 */
export function ComposerImageViewer() {
	const [uri, setUri] = useState<string | null>(null);
	const insets = useSafeAreaInsets();

	useEffect(() => {
		const show: Show = (next) => setUri(next);
		viewers.push(show);
		return () => {
			viewers.splice(viewers.indexOf(show), 1);
		};
	}, []);

	return (
		<Modal
			animationType="fade"
			visible={uri !== null}
			onRequestClose={() => setUri(null)}
			statusBarTranslucent
			navigationBarTranslucent
		>
			<View style={styles.backdrop}>
				{uri ? (
					<Image
						source={{ uri }}
						contentFit="contain"
						style={StyleSheet.absoluteFill}
					/>
				) : null}
				<Pressable
					accessibilityRole="button"
					hitSlop={12}
					onPress={() => setUri(null)}
					style={[styles.close, { top: insets.top + 12 }]}
				>
					<X color="#fafafa" size={20} />
				</Pressable>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	backdrop: { flex: 1, backgroundColor: "#000" },
	close: {
		position: "absolute",
		left: 16,
		width: 36,
		height: 36,
		borderRadius: 18,
		backgroundColor: "rgba(38, 38, 38, 0.8)",
		alignItems: "center",
		justifyContent: "center",
	},
});
