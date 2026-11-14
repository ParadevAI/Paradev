import {
	ChevronLeft,
	Copy,
	LayoutGrid,
	Pencil,
	Plus,
	X,
} from "lucide-react-native";
import { useRef, useState } from "react";
import {
	Animated,
	type ScrollViewInstance,
	StyleSheet,
	View,
} from "react-native";
import type {
	ComposerSessionTab,
	ComposerSessionTabLabels,
} from "../../Composer.types";
import { COMPOSER_METRICS } from "../../constants";
import { ComposerMenuSheet } from "../ComposerMenuSheet";
import { SessionTabPill } from "./components/SessionTabPill";
import { StripControl } from "./components/StripControl";

interface ComposerSessionTabsProps {
	tabs: ComposerSessionTab[];
	labels: ComposerSessionTabLabels;
	onSelect: (id: string) => void;
	onClose: (id: string) => void;
	onRename: (id: string) => void;
	onCopyId: (id: string) => void;
	onNewSession: () => void;
	onAllSessions: () => void;
}

/**
 * The workspace's sessions as a tab strip. Press and hold a tab for its menu;
 * the chevron that scrolls back to the start fades in as the strip scrolls.
 */
export function ComposerSessionTabs({
	tabs,
	labels,
	onSelect,
	onClose,
	onRename,
	onCopyId,
	onNewSession,
	onAllSessions,
}: ComposerSessionTabsProps) {
	const scrollRef = useRef<ScrollViewInstance>(null);
	const scrollX = useRef(new Animated.Value(0)).current;
	const [scrolled, setScrolled] = useState(false);
	const [menuTabId, setMenuTabId] = useState<string | null>(null);

	return (
		<View style={styles.row}>
			<View style={styles.strip}>
				<Animated.ScrollView
					ref={scrollRef}
					horizontal
					keyboardShouldPersistTaps="always"
					showsHorizontalScrollIndicator={false}
					scrollEventThrottle={16}
					onScroll={Animated.event(
						[{ nativeEvent: { contentOffset: { x: scrollX } } }],
						{
							useNativeDriver: true,
							listener: (event: {
								nativeEvent: { contentOffset: { x: number } };
							}) =>
								setScrolled(
									event.nativeEvent.contentOffset.x >
										COMPOSER_METRICS.tabChevronReveal / 2,
								),
						},
					)}
					contentContainerStyle={styles.tabs}
				>
					{tabs.map((tab) => (
						<SessionTabPill
							key={tab.id}
							tab={tab}
							closeLabel={labels.close}
							onSelect={() => onSelect(tab.id)}
							onClose={() => onClose(tab.id)}
							onLongPress={() => setMenuTabId(tab.id)}
						/>
					))}
				</Animated.ScrollView>
				<Animated.View
					pointerEvents={scrolled ? "auto" : "none"}
					importantForAccessibility={scrolled ? "auto" : "no-hide-descendants"}
					style={[
						styles.chevron,
						{
							opacity: scrollX.interpolate({
								inputRange: [0, COMPOSER_METRICS.tabChevronReveal],
								outputRange: [0, 1],
								extrapolate: "clamp",
							}),
						},
					]}
				>
					<StripControl
						icon={ChevronLeft}
						label={labels.scrollToStart}
						opaque
						onPress={() => scrollRef.current?.scrollTo({ x: 0 })}
					/>
				</Animated.View>
			</View>
			<StripControl
				icon={Plus}
				label={labels.newSession}
				onPress={onNewSession}
			/>
			<StripControl
				icon={LayoutGrid}
				label={labels.allSessions}
				onPress={onAllSessions}
			/>
			<ComposerMenuSheet
				visible={menuTabId !== null}
				items={[
					{ id: "rename", label: labels.rename, icon: Pencil },
					{ id: "copyId", label: labels.copyId, icon: Copy },
					{ id: "close", label: labels.close, icon: X, destructive: true },
				]}
				onSelect={(action) => {
					if (menuTabId === null) return;
					if (action === "rename") onRename(menuTabId);
					else if (action === "copyId") onCopyId(menuTabId);
					else onClose(menuTabId);
				}}
				onClose={() => setMenuTabId(null)}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: COMPOSER_METRICS.gap,
	},
	strip: { flex: 1 },
	tabs: { gap: COMPOSER_METRICS.gap },
	chevron: { position: "absolute", left: 0, top: 0, bottom: 0 },
});
