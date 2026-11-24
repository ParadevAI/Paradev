import { requireOptionalNativeModule } from "expo";
import { processColor } from "react-native";
import type {
	AttachmentsSheetAction,
	AttachmentsSheetAsset,
	PresentAttachmentsSheet,
} from "./AttachmentsSheet.types";

type AttachmentsSheetEvents = {
	onAddAssets: (event: { assets: AttachmentsSheetAsset[] }) => void;
	onAction: (event: { action: AttachmentsSheetAction }) => void;
	onDismiss: () => void;
};

// expo-modules-core 56.0.23 exports a broken `NativeModule` type alias (the
// constructor type, generic dropped), so the emitter surface is typed by hand.
type AttachmentsSheetNativeModule = {
	present(options: Record<string, number | string>): Promise<boolean>;
	addListener<Name extends keyof AttachmentsSheetEvents>(
		eventName: Name,
		listener: AttachmentsSheetEvents[Name],
	): { remove(): void };
};

const AttachmentsSheet =
	requireOptionalNativeModule<AttachmentsSheetNativeModule>("AttachmentsSheet");

export const presentAttachmentsSheet: PresentAttachmentsSheet = async (
	theme,
	handlers,
) => {
	if (!AttachmentsSheet) {
		console.warn(
			"AttachmentsSheet native module unavailable — rebuild the dev client",
		);
		return false;
	}
	const subscriptions = [
		AttachmentsSheet.addListener("onAddAssets", ({ assets }) => {
			settle();
			handlers.onAddAssets(assets);
		}),
		AttachmentsSheet.addListener("onAction", ({ action }) => {
			settle();
			handlers.onAction(action);
		}),
		AttachmentsSheet.addListener("onDismiss", () => {
			settle();
			handlers.onDismiss?.();
		}),
	];
	const settle = () => {
		for (const subscription of subscriptions) subscription.remove();
	};

	const { colorScheme, ...colors } = theme;
	const presented = await AttachmentsSheet.present({
		colorScheme,
		...Object.fromEntries(
			Object.entries(colors).map(([token, value]) => [
				token,
				(processColor(value) as number | null) ?? 0,
			]),
		),
	});
	if (!presented) settle();
	return presented;
};
