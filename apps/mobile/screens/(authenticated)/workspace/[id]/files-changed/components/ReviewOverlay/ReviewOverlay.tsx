import { useLingui } from "@lingui/react/macro";
import { Stack } from "expo-router";
import { toolbarIcon } from "@/lib/navigation";
import type { ReviewOverlayComponent } from "./ReviewOverlay.types";

// A bottom toolbar here holds icon buttons only and drops a text one, so the
// send action is an icon and its count goes in the label. It mounts with the
// first draft rather than toggling `hidden`: a hidden item here never shows again.
export const ReviewOverlay: ReviewOverlayComponent = ({
	draftCount,
	onFinishReview,
	onJumpToFile,
}) => {
	const { t } = useLingui();
	return (
		<Stack.Toolbar placement="bottom">
			{draftCount > 0 ? (
				<Stack.Toolbar.Button
					icon={toolbarIcon("send")}
					tintColor="#16a34a"
					accessibilityLabel={
						draftCount > 1
							? t({
									message: `Send to chat (${draftCount})`,
								})
							: t({ message: "Send to chat" })
					}
					onPress={onFinishReview}
				/>
			) : null}
			<Stack.Toolbar.Button
				icon={toolbarIcon("jumpToFile")}
				accessibilityLabel={t({
					message: "Jump to file",
				})}
				onPress={onJumpToFile}
			/>
		</Stack.Toolbar>
	);
};
