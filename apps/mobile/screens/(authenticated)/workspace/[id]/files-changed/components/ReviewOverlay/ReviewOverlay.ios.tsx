import { useLingui } from "@lingui/react/macro";
import { Stack } from "expo-router";
import { toolbarIcon } from "@/lib/navigation";
import type { ReviewOverlayComponent } from "./ReviewOverlay.types";

// Native bottom toolbar bar buttons: UIKit owns sizing/placement, matching
// the header buttons' glass. A custom Toolbar.View capsule (for a GitHub-style
// disclosure chevron) gets squeezed in bottom placements — no sizing contract
// — so the CTA stays a system prominent button.
export const ReviewOverlay: ReviewOverlayComponent = ({
	draftCount,
	onFinishReview,
	onJumpToFile,
}) => {
	const { t } = useLingui();
	return (
		<Stack.Toolbar placement="bottom">
			<Stack.Toolbar.Spacer />
			<Stack.Toolbar.Button
				hidden={draftCount === 0}
				variant="prominent"
				tintColor="#16a34a"
				onPress={onFinishReview}
			>
				{draftCount > 1
					? t({
							message: `Send to chat (${draftCount})`,
						})
					: t({ message: "Send to chat" })}
			</Stack.Toolbar.Button>
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
