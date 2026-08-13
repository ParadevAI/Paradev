import {
	Button,
	Host,
	HStack,
	Image,
	TextField,
	type TextFieldRef,
	VStack,
} from "@expo/ui/swift-ui";
import {
	buttonBorderShape,
	buttonStyle,
	clipped,
	contentShape,
	disabled,
	environment,
	frame,
	glassEffect,
	lineLimit,
	onTapGesture,
	opacity,
	padding,
	shapes,
	tint,
	truncationMode,
} from "@expo/ui/swift-ui/modifiers";
import { useRef, useState } from "react";
import { View } from "react-native";
import { QuickKeysRow } from "./components/QuickKeysRow";
import { PILL_RADIUS, type TerminalQuickKey } from "./constants";

interface TerminalComposerProps {
	placeholder?: string;
	/** Submit the current draft. Return true to clear the field. */
	onSubmit: (text: string) => void;
	onQuickKey: (key: TerminalQuickKey) => void;
}

/**
 * Terminal input, ported from the home glass composer (NewChatWidget): the
 * same SwiftUI glass pill + draft-ref TextField, trimmed to the terminal's
 * needs — no project/branch chips, no attachments, no expand chrome. The
 * quick-keys float above the pill (esc/tab/arrows); the pill sends the draft.
 * Keyboard avoidance is the parent screen's job (inline KeyboardAvoidingView),
 * so this component is a plain bottom-anchored column.
 */
export function TerminalComposer({
	placeholder = "Send input",
	onSubmit,
	onQuickKey,
}: TerminalComposerProps) {
	const fieldRef = useRef<TextFieldRef>(null);
	// The draft lives in a ref, never provider state — mirroring the home
	// composer, so each keystroke doesn't re-render the SwiftUI Host.
	const draftRef = useRef("");
	const [hasText, setHasText] = useState(false);

	const writeDraft = (text: string) => {
		draftRef.current = text;
		setHasText(text.trim().length > 0);
	};

	const submit = () => {
		const text = draftRef.current;
		if (text.trim().length === 0) return;
		onSubmit(text);
		draftRef.current = "";
		setHasText(false);
		void fieldRef.current?.clear();
	};

	return (
		<View className="gap-2 px-3 pb-2">
			{/* z-10: the settled glass Host renders taller than the frame
			    matchContents reports and, as the later sibling, sits above the
			    chips — without the raise its invisible top edge swallows their
			    taps (the pill's tap-to-focus fires instead). */}
			<View className="z-10 flex-row pl-1">
				<QuickKeysRow onKey={onQuickKey} />
			</View>
			<Host matchContents={{ vertical: true }} style={{ width: "100%" }}>
				<VStack
					spacing={0}
					modifiers={[
						environment("colorScheme", "dark"),
						frame({ maxWidth: 100_000 }),
						glassEffect({
							glass: { variant: "regular", interactive: true },
							shape: "roundedRectangle",
							cornerRadius: PILL_RADIUS,
						}),
						contentShape(shapes.rectangle()),
						onTapGesture(() => void fieldRef.current?.focus()),
					]}
				>
					<HStack
						spacing={6}
						modifiers={[padding({ horizontal: 12, vertical: 6 })]}
					>
						<TextField
							ref={fieldRef}
							axis="vertical"
							placeholder={placeholder}
							onTextChange={writeDraft}
							modifiers={[
								padding({ horizontal: 4 }),
								frame({ minHeight: 38 }),
								lineLimit(5),
								truncationMode("tail"),
							]}
						/>
						<HStack
							spacing={0}
							modifiers={[
								frame({ width: hasText ? undefined : 0 }),
								opacity(hasText ? 1 : 0),
								clipped(),
							]}
						>
							<Button
								onPress={submit}
								modifiers={[
									buttonStyle("borderedProminent"),
									buttonBorderShape("circle"),
									tint("#ffffff"),
									disabled(!hasText),
								]}
							>
								<Image
									systemName="arrow.up"
									size={16}
									color="#1c1c1e"
									modifiers={[frame({ width: 16, height: 16 })]}
								/>
							</Button>
						</HStack>
					</HStack>
				</VStack>
			</Host>
		</View>
	);
}
