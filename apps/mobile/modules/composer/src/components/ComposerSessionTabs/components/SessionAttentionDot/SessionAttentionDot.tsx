import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, StyleSheet, View } from "react-native";
import type { ComposerSessionTab } from "../../../../Composer.types";
import {
	COMPOSER_METRICS,
	SESSION_ATTENTION_COLORS,
} from "../../../../constants";

interface SessionAttentionDotProps {
	attention: NonNullable<ComposerSessionTab["attention"]>;
}

/** Static for `review`, which is finished; the live states ping, as on desktop. */
export function SessionAttentionDot({ attention }: SessionAttentionDotProps) {
	const color = SESSION_ATTENTION_COLORS[attention];
	const ping = useRef(new Animated.Value(0)).current;
	const [reduceMotion, setReduceMotion] = useState(false);
	const pings = attention !== "review" && !reduceMotion;

	useEffect(() => {
		void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
		const subscription = AccessibilityInfo.addEventListener(
			"reduceMotionChanged",
			setReduceMotion,
		);
		return () => subscription.remove();
	}, []);

	useEffect(() => {
		if (!pings) return;
		const loop = Animated.loop(
			Animated.timing(ping, {
				toValue: 1,
				duration: 1500,
				useNativeDriver: true,
			}),
		);
		loop.start();
		return () => {
			loop.stop();
			ping.setValue(0);
		};
	}, [pings, ping]);

	return (
		<View style={[styles.dot, { backgroundColor: color }]}>
			{pings ? (
				<Animated.View
					style={[
						styles.ring,
						{
							borderColor: color,
							opacity: ping.interpolate({
								inputRange: [0, 1],
								outputRange: [0.7, 0],
							}),
							transform: [
								{
									scale: ping.interpolate({
										inputRange: [0, 1],
										outputRange: [1, 2.6],
									}),
								},
							],
						},
					]}
				/>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	dot: {
		width: COMPOSER_METRICS.tabDotSize,
		height: COMPOSER_METRICS.tabDotSize,
		borderRadius: COMPOSER_METRICS.tabDotSize / 2,
	},
	ring: {
		...StyleSheet.absoluteFill,
		borderRadius: COMPOSER_METRICS.tabDotSize / 2,
		borderWidth: 1,
	},
});
