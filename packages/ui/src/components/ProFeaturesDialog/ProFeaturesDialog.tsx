import { Trans } from "@lingui/react/macro";
import { Button } from "../ui/button";
import { Dialog, DialogContent } from "../ui/dialog";
import { FeaturePreview } from "./components/FeaturePreview";
import { FeatureSidebar } from "./components/FeatureSidebar";
import { PRO_FEATURES } from "./constants";

interface ProFeaturesDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	selectedFeatureId: string;
	highlightedFeatureId: string;
	onSelectFeature: (featureId: string) => void;
	onUpgrade: () => void;
}

export function ProFeaturesDialog({
	open,
	onOpenChange,
	selectedFeatureId,
	highlightedFeatureId,
	onSelectFeature,
	onUpgrade,
}: ProFeaturesDialogProps) {
	const selectedFeature =
		PRO_FEATURES.find((f) => f.id === selectedFeatureId) ?? PRO_FEATURES[0];
	if (!selectedFeature) return null;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="flex max-h-[calc(100dvh-2rem)] !w-[744px] !max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden !rounded-none p-0"
				showCloseButton={false}
				aria-describedby={undefined}
			>
				<div className="flex min-h-0 flex-col overflow-y-auto md:flex-row">
					<FeatureSidebar
						selectedFeatureId={selectedFeature.id}
						highlightedFeatureId={highlightedFeatureId}
						onSelectFeature={onSelectFeature}
					/>
					<FeaturePreview selectedFeature={selectedFeature} />
				</div>

				<div className="box-border flex shrink-0 items-center justify-between border-t bg-background px-5 py-4">
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						<Trans>Cancel</Trans>
					</Button>
					<Button onClick={onUpgrade}>
						<Trans>Get Paradev Pro</Trans>
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
