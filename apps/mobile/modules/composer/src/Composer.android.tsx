import { Image } from "expo-image";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { ArrowUp, ChevronDown, Plus, Square } from "lucide-react-native";
import {
	forwardRef,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import {
	ActivityIndicator,
	Keyboard,
	PixelRatio,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	type TextInputInstance,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type {
	ComposerAttachment,
	ComposerComponent,
	ComposerHandle,
	ComposerMenuOption,
	ComposerProps,
	FileThumbnail,
	PresentImage,
} from "./Composer.types";
import { ComposerAttachmentTray } from "./components/ComposerAttachmentTray";
import {
	ComposerImageViewer,
	showImage,
} from "./components/ComposerImageViewer";
import { ComposerModeMenu } from "./components/ComposerModeMenu";
import { COMPOSER_COLORS, COMPOSER_METRICS } from "./constants";
import { joinDraft } from "./utils/joinDraft";

const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|heic|heif|bmp|avif)(\?|$)/i;

export const presentImage: PresentImage = async (uri) => {
	showImage(uri);
};

export const fileThumbnail: FileThumbnail = async (uri, side) => {
	if (!IMAGE_EXTENSION.test(uri)) return null;
	try {
		const image = await ImageManipulator.manipulate(uri)
			.resize({ width: PixelRatio.getPixelSizeForLayoutSize(side) })
			.renderAsync();
		const result = await image.saveAsync({ format: SaveFormat.PNG });
		return result.uri;
	} catch {
		return null;
	}
};

export const Composer: ComposerComponent = forwardRef<
	ComposerHandle,
	ComposerProps
>(function Composer(
	{
		placeholder = "",
		initialDraft = "",
		backdrop = "dim",
		attachments = [],
		selectedModel,
		launchOptions,
		modeOptions,
		selectedModeId,
		canStop = false,
		headerChips,
		showAttachments = true,
		autocapitalization = "sentences",
		compactEditor = false,
		isSending = false,
		onSubmit,
		onAttachmentsPress,
		onModelPress,
		onLaunchOptionPress,
		onModeSelect,
		onStop,
		onChipPress,
		onHeightChange,
		onDraftChange,
		onRemoveAttachment,
		onAttachmentPress,
		onExpandedChange,
	},
	ref,
) {
	const inputRef = useRef<TextInputInstance>(null);
	const [draft, setDraftState] = useState(initialDraft);
	const [expanded, setExpanded] = useState(false);
	const keyboardHeight = useKeyboardHeight();
	const insets = useSafeAreaInsets();

	const setDraft = (text: string) => {
		setDraftState(text);
		onDraftChange?.(text);
	};

	const draftRef = useRef(draft);
	draftRef.current = draft;

	useImperativeHandle(ref, () => ({
		clear: () => setDraft(""),
		appendDraft: (text) => setDraft(joinDraft(draftRef.current, text)),
		focus: () => inputRef.current?.focus(),
		blur: () => inputRef.current?.blur(),
	}));

	const onExpandedChangeRef = useRef(onExpandedChange);
	onExpandedChangeRef.current = onExpandedChange;
	const reportedExpanded = useRef(false);
	useEffect(() => {
		if (reportedExpanded.current === expanded) return;
		reportedExpanded.current = expanded;
		onExpandedChangeRef.current?.(expanded);
	}, [expanded]);

	const hasDraft = draft.trim().length > 0;
	const hasContent = hasDraft || attachments.length > 0;
	const isUploading = attachments.some(
		(item) => item.progress !== undefined && !item.failed,
	);
	const submit = () => {
		if (!hasContent || isSending || isUploading) return;
		onSubmit?.(draft);
	};

	const openAttachment = (attachment: ComposerAttachment) => {
		if (attachment.kind === "image") showImage(attachment.uri);
		else onAttachmentPress?.(attachment.id);
	};

	const editorLines = compactEditor
		? COMPOSER_METRICS.compactEditorLines
		: COMPOSER_METRICS.editorLines;
	const lift = Math.max(keyboardHeight, insets.bottom);

	return (
		<View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
			{expanded && backdrop === "dim" ? (
				<Pressable
					accessible={false}
					onPress={() => inputRef.current?.blur()}
					style={[StyleSheet.absoluteFill, styles.scrim]}
				/>
			) : null}
			<View
				pointerEvents="box-none"
				style={[styles.anchor, { paddingBottom: lift }]}
			>
				<View
					pointerEvents="box-none"
					onLayout={(event) =>
						onHeightChange?.(event.nativeEvent.layout.height)
					}
					style={styles.stack}
				>
					{expanded && headerChips && headerChips.length > 0 ? (
						<View style={styles.chips}>
							{headerChips.map((chip) => (
								<MenuButton
									key={chip.id}
									option={chip}
									onPress={() => onChipPress?.(chip.id)}
								/>
							))}
						</View>
					) : null}
					<View style={styles.card}>
						{expanded && attachments.length > 0 ? (
							<ComposerAttachmentTray
								attachments={attachments}
								onPress={openAttachment}
								onRemove={(id) => onRemoveAttachment?.(id)}
							/>
						) : null}
						<View style={expanded ? styles.editor : styles.collapsedField}>
							<TextInput
								ref={inputRef}
								value={draft}
								onChangeText={setDraft}
								onFocus={() => setExpanded(true)}
								onBlur={() => setExpanded(false)}
								placeholder={placeholder}
								placeholderTextColor={COMPOSER_COLORS.muted}
								autoCapitalize={
									autocapitalization === "never" ? "none" : "sentences"
								}
								autoCorrect={autocapitalization !== "never"}
								multiline
								textAlignVertical="top"
								style={[
									styles.input,
									{
										minHeight: COMPOSER_METRICS.lineHeight * editorLines,
										maxHeight:
											COMPOSER_METRICS.lineHeight *
											COMPOSER_METRICS.maxEditorLines,
									},
								]}
							/>
						</View>
						<View style={styles.row}>
							{showAttachments ? (
								<RoundButton onPress={onAttachmentsPress}>
									<Plus color={COMPOSER_COLORS.foreground} size={20} />
								</RoundButton>
							) : null}
							{modeOptions && modeOptions.length > 0 ? (
								<ComposerModeMenu
									options={modeOptions}
									selectedId={selectedModeId}
									onSelect={onModeSelect}
								/>
							) : null}
							{expanded ? (
								<View style={styles.pickers}>
									{selectedModel ? (
										<MenuButton option={selectedModel} onPress={onModelPress} />
									) : null}
									{launchOptions?.map((option) => (
										<MenuButton
											key={option.id}
											option={option}
											onPress={() => onLaunchOptionPress?.(option.id)}
										/>
									))}
								</View>
							) : (
								<Pressable
									accessibilityRole="button"
									onPress={() => inputRef.current?.focus()}
									style={styles.collapsedText}
								>
									<CollapsedThumbs attachments={attachments} />
									<Text
										numberOfLines={1}
										style={[
											styles.collapsedLabel,
											!hasDraft && { color: COMPOSER_COLORS.muted },
										]}
									>
										{hasDraft ? draft.trim() : placeholder}
									</Text>
								</Pressable>
							)}
							{isSending ? (
								<View style={styles.round}>
									<ActivityIndicator color={COMPOSER_COLORS.muted} />
								</View>
							) : hasContent ? (
								<RoundButton filled disabled={isUploading} onPress={submit}>
									<ArrowUp
										color={COMPOSER_COLORS.card}
										size={20}
										strokeWidth={2.5}
									/>
								</RoundButton>
							) : canStop ? (
								<RoundButton filled onPress={onStop}>
									<Square
										color={COMPOSER_COLORS.card}
										fill={COMPOSER_COLORS.card}
										size={14}
									/>
								</RoundButton>
							) : null}
						</View>
					</View>
				</View>
			</View>
			<ComposerImageViewer />
		</View>
	);
});

function useKeyboardHeight() {
	const [height, setHeight] = useState(0);
	useEffect(() => {
		const show = Keyboard.addListener("keyboardDidShow", (event) =>
			setHeight(event.endCoordinates.height),
		);
		const hide = Keyboard.addListener("keyboardDidHide", () => setHeight(0));
		return () => {
			show.remove();
			hide.remove();
		};
	}, []);
	return height;
}

function RoundButton({
	children,
	filled = false,
	disabled = false,
	onPress,
}: {
	children: React.ReactNode;
	filled?: boolean;
	disabled?: boolean;
	onPress?: () => void;
}) {
	return (
		<Pressable
			accessibilityRole="button"
			disabled={disabled}
			hitSlop={4}
			onPress={onPress}
			style={({ pressed }) => [
				styles.round,
				filled && styles.roundFilled,
				(pressed || disabled) && styles.pressed,
			]}
		>
			{children}
		</Pressable>
	);
}

function MenuButton({
	option,
	onPress,
}: {
	option: ComposerMenuOption;
	onPress?: () => void;
}) {
	return (
		<Pressable
			accessibilityRole="button"
			onPress={onPress}
			style={({ pressed }) => [styles.menuButton, pressed && styles.pressed]}
		>
			{option.iconUri ? (
				<Image source={{ uri: option.iconUri }} style={styles.menuIcon} />
			) : option.avatar ? (
				<View style={[styles.menuIcon, styles.avatar]}>
					<Text style={styles.avatarLetter}>
						{option.label.charAt(0).toUpperCase()}
					</Text>
				</View>
			) : null}
			<Text
				numberOfLines={1}
				style={[styles.menuLabel, option.muted && styles.menuLabelMuted]}
			>
				{option.label}
			</Text>
			<ChevronDown color={COMPOSER_COLORS.muted} size={14} />
		</Pressable>
	);
}

function CollapsedThumbs({
	attachments,
}: {
	attachments: ComposerAttachment[];
}) {
	const first = attachments[0];
	if (!first) return null;
	return (
		<View style={styles.miniThumbs}>
			{first.kind === "image" ? (
				<Image source={{ uri: first.uri }} style={styles.miniThumb} />
			) : (
				<View style={[styles.miniThumb, styles.miniFile]} />
			)}
			{attachments.length > 1 ? (
				<Text style={styles.more}>+{attachments.length - 1}</Text>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	scrim: { backgroundColor: COMPOSER_COLORS.scrim },
	anchor: { flex: 1, justifyContent: "flex-end" },
	stack: {
		paddingHorizontal: COMPOSER_METRICS.edgeInset,
		paddingTop: COMPOSER_METRICS.gap,
		paddingBottom: COMPOSER_METRICS.gap,
		gap: COMPOSER_METRICS.gap,
	},
	chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
	card: {
		backgroundColor: COMPOSER_COLORS.card,
		borderColor: COMPOSER_COLORS.border,
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 26,
		overflow: "hidden",
	},
	editor: { paddingHorizontal: COMPOSER_METRICS.edgeInset + 4, paddingTop: 12 },
	collapsedField: { height: 0, overflow: "hidden", opacity: 0 },
	input: {
		color: COMPOSER_COLORS.foreground,
		fontSize: 16,
		lineHeight: COMPOSER_METRICS.lineHeight,
		padding: 0,
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: COMPOSER_METRICS.gap,
		padding: 6,
	},
	pickers: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		overflow: "hidden",
	},
	collapsedText: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		gap: COMPOSER_METRICS.gap,
		minHeight: COMPOSER_METRICS.controlSize,
		paddingLeft: 4,
	},
	collapsedLabel: { flex: 1, color: COMPOSER_COLORS.foreground, fontSize: 16 },
	round: {
		width: COMPOSER_METRICS.controlSize,
		height: COMPOSER_METRICS.controlSize,
		borderRadius: COMPOSER_METRICS.controlSize / 2,
		backgroundColor: COMPOSER_COLORS.control,
		alignItems: "center",
		justifyContent: "center",
	},
	roundFilled: { backgroundColor: COMPOSER_COLORS.foreground },
	pressed: { opacity: 0.5 },
	menuButton: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		maxWidth: 200,
		paddingHorizontal: 10,
		height: 32,
		borderRadius: 16,
		backgroundColor: COMPOSER_COLORS.control,
	},
	menuIcon: { width: 16, height: 16, borderRadius: 4 },
	avatar: {
		backgroundColor: COMPOSER_COLORS.border,
		alignItems: "center",
		justifyContent: "center",
	},
	avatarLetter: {
		color: COMPOSER_COLORS.foreground,
		fontSize: 10,
		fontWeight: "600",
	},
	menuLabel: { flexShrink: 1, color: COMPOSER_COLORS.foreground, fontSize: 14 },
	menuLabelMuted: { color: COMPOSER_COLORS.muted },
	miniThumbs: { flexDirection: "row", alignItems: "center", gap: 4 },
	miniThumb: {
		width: COMPOSER_METRICS.miniThumbSize,
		height: COMPOSER_METRICS.miniThumbSize,
		borderRadius: 6,
	},
	miniFile: { backgroundColor: COMPOSER_COLORS.control },
	more: { color: COMPOSER_COLORS.muted, fontSize: 13 },
});
