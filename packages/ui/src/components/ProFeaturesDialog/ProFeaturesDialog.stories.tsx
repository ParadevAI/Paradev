import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { PRO_FEATURES } from "./constants";
import { ProFeaturesDialog } from "./ProFeaturesDialog";

const meta = {
	title: "Pro features dialog",
	component: ProFeaturesDialog,
	args: {
		open: true,
		onOpenChange: () => {},
		selectedFeatureId: "remote-access",
		highlightedFeatureId: "remote-access",
		onSelectFeature: () => {},
		onUpgrade: () => {},
	},
	render: (args) => {
		const [selectedFeatureId, setSelectedFeatureId] = useState(
			args.selectedFeatureId,
		);
		return (
			<ProFeaturesDialog
				{...args}
				selectedFeatureId={selectedFeatureId}
				onSelectFeature={setSelectedFeatureId}
			/>
		);
	},
} satisfies Meta<typeof ProFeaturesDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RemoteAccess: Story = {};
export const MobileApp: Story = {
	args: {
		selectedFeatureId: "mobile-app",
		highlightedFeatureId: PRO_FEATURES[0]?.id ?? "mobile-app",
	},
};
