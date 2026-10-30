import { Image } from "expo-image";
import { X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ComposerSessionTab } from "../../../../Composer.types";
import { COMPOSER_COLORS, COMPOSER_METRICS } from "../../../../constants";
import { SessionAttentionDot } from "../SessionAttentionDot";

interface SessionTabPillProps {
	tab: ComposerSessionTab;
	closeLabel: string;
	onSelect: () => void;
	onClose: () => void;
	onLongPress: () => void;
}

const CLOSE_SLOT = COMPOSER_METRICS.tabCloseSize + 5;

export function SessionTabPill({
	tab,
	closeLabel,
	onSelect,
	onClose,
	onLongPress,
}: SessionTabPillProps) {
	const [iconFailed, setIconFailed] = useState(false);
	const color = tab.selected
		? COMPOSER_COLORS.foreground
		: COMPOSER_COLORS.muted;
	return (
		<View>
			<Pressable
				accessibilityRole="tab"
				accessibilityState={{ selected: tab.selected }}
				onPress={onSelect}
				onLongPress={onLongPress}
				style={({ pressed }) => [
					styles.pill,
					tab.selected && styles.selected,
					tab.selected && { paddingRight: 10 + CLOSE_SLOT },
					pressed && styles.pressed,
				]}
			>
				{tab.iconUri && !iconFailed ? (
					<Image
						source={{ uri: tab.iconUri }}
						contentFit="contain"
						onError={() => setIconFailed(true)}
						style={styles.mark}
					/>
				) : (
					<Text style={[styles.initial, { color }]}>
						{(tab.label.charAt(0) || "?").toUpperCase()}
					</Text>
				)}
				<Text numberOfLines={1} style={[styles.label, { color }]}>
					{tab.label}
				</Text>
				{tab.attention ? (
					<SessionAttentionDot attention={tab.attention} />
				) : null}
			</Pressable>
			{tab.selected ? (
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={closeLabel}
					hitSlop={8}
					onPress={onClose}
					style={styles.close}
				>
					<X color={COMPOSER_COLORS.card} size={10} strokeWidth={3.5} />
				</Pressable>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	pill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		height: COMPOSER_METRICS.tabControlSize,
		paddingHorizontal: 10,
		borderRadius: COMPOSER_METRICS.tabRadius,
		backgroundColor: COMPOSER_COLORS.tab,
	},
	selected: { backgroundColor: COMPOSER_COLORS.tabSelected },
	pressed: { opacity: 0.6 },
	mark: {
		width: COMPOSER_METRICS.tabMarkSize,
		height: COMPOSER_METRICS.tabMarkSize,
	},
	initial: {
		width: COMPOSER_METRICS.tabMarkSize,
		textAlign: "center",
		fontSize: 8,
		fontWeight: "700",
	},
	label: {
		maxWidth: COMPOSER_METRICS.tabMaxLabelWidth,
		fontSize: COMPOSER_METRICS.tabFontSize,
		fontWeight: "500",
	},
	close: {
		position: "absolute",
		right: 5,
		top: (COMPOSER_METRICS.tabControlSize - COMPOSER_METRICS.tabCloseSize) / 2,
		width: COMPOSER_METRICS.tabCloseSize,
		height: COMPOSER_METRICS.tabCloseSize,
		borderRadius: COMPOSER_METRICS.tabCloseSize / 2,
		backgroundColor: COMPOSER_COLORS.tabClose,
		alignItems: "center",
		justifyContent: "center",
	},
});
