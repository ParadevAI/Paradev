import { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import type { VoiceStatus } from "@/lib/voice/voiceStore";
import type { VoiceOrbComponent } from "./VoiceOrb.types";

const PULSE: Record<VoiceStatus, { scale: number; period: number }> = {
	idle: { scale: 1, period: 0 },
	connecting: { scale: 1.06, period: 900 },
	reconnecting: { scale: 1.06, period: 900 },
	listening: { scale: 1.04, period: 1800 },
	thinking: { scale: 1.08, period: 700 },
	speaking: { scale: 1.14, period: 420 },
	ended: { scale: 1, period: 0 },
};

export const VoiceOrb: VoiceOrbComponent = ({ status, size }) => {
	const pulse = useRef(new Animated.Value(0)).current;
	const { scale, period } = PULSE[status];
	const asleep = status === "idle" || status === "ended";

	useEffect(() => {
		pulse.setValue(0);
		if (!period) return;
		const half = { duration: period / 2, easing: Easing.inOut(Easing.sin) };
		const loop = Animated.loop(
			Animated.sequence([
				Animated.timing(pulse, { toValue: 1, useNativeDriver: false, ...half }),
				Animated.timing(pulse, { toValue: 0, useNativeDriver: false, ...half }),
			]),
		);
		loop.start();
		return () => loop.stop();
	}, [pulse, period]);

	const grow = pulse.interpolate({
		inputRange: [0, 1],
		outputRange: [1, scale],
	});
	const glow = pulse.interpolate({
		inputRange: [0, 1],
		outputRange: [0.25, 0.55],
	});
	const core = size * 0.62;

	return (
		<View
			accessibilityElementsHidden
			style={{
				width: size,
				height: size,
				alignItems: "center",
				justifyContent: "center",
				opacity: asleep ? 0.55 : 1,
			}}
		>
			<Animated.View
				style={{
					position: "absolute",
					width: size,
					height: size,
					borderRadius: size / 2,
					backgroundColor: "#93c5fd",
					opacity: glow,
					transform: [{ scale: grow }],
				}}
			/>
			<Animated.View
				style={{
					width: core,
					height: core,
					borderRadius: core / 2,
					backgroundColor: "#e0f2fe",
					borderWidth: core * 0.08,
					borderColor: "#bfdbfe",
					transform: [{ scale: grow }],
				}}
			/>
		</View>
	);
};
