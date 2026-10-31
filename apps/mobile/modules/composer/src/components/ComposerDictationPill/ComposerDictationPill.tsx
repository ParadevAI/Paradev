import { Square } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { COMPOSER_COLORS, COMPOSER_METRICS } from "../../constants";

const BAR_WEIGHTS = [0.5, 0.8, 1, 0.7, 0.45];

interface ComposerDictationPillProps {
	level: number;
	stopLabel: string;
	onStop: () => void;
}

/** Recording: the input level, the time so far, and stop. */
export function ComposerDictationPill({
	level,
	stopLabel,
	onStop,
}: ComposerDictationPillProps) {
	const seconds = useElapsedSeconds();
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={stopLabel}
			hitSlop={4}
			onPress={onStop}
			style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
		>
			<View style={styles.bars}>
				{BAR_WEIGHTS.map((weight, index) => (
					<View
						// biome-ignore lint/suspicious/noArrayIndexKey: fixed bars
						key={index}
						style={[styles.bar, { height: 4 + 14 * weight * level }]}
					/>
				))}
			</View>
			<Text style={styles.time}>
				{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
			</Text>
			<View style={styles.stop}>
				<Square
					color={COMPOSER_COLORS.card}
					fill={COMPOSER_COLORS.card}
					size={10}
				/>
			</View>
		</Pressable>
	);
}

function useElapsedSeconds() {
	const [seconds, setSeconds] = useState(0);
	useEffect(() => {
		const startedAt = Date.now();
		const timer = setInterval(
			() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)),
			500,
		);
		return () => clearInterval(timer);
	}, []);
	return seconds;
}

const styles = StyleSheet.create({
	pill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		height: COMPOSER_METRICS.controlSize,
		paddingLeft: 12,
		paddingRight: 4,
		borderRadius: COMPOSER_METRICS.controlSize / 2,
		backgroundColor: COMPOSER_COLORS.control,
	},
	pressed: { opacity: 0.5 },
	bars: { flexDirection: "row", alignItems: "center", gap: 2, height: 18 },
	bar: {
		width: 3,
		borderRadius: 1.5,
		backgroundColor: COMPOSER_COLORS.destructive,
	},
	time: {
		color: COMPOSER_COLORS.foreground,
		fontSize: 13,
		fontVariant: ["tabular-nums"],
	},
	stop: {
		width: 28,
		height: 28,
		borderRadius: 14,
		backgroundColor: COMPOSER_COLORS.foreground,
		alignItems: "center",
		justifyContent: "center",
	},
});
