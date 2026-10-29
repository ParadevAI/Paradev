import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";

interface OnboardingNavigationProps {
	onBack: (() => void) | null;
	onContinue: (() => void) | null;
}

export function OnboardingNavigation({
	onBack,
	onContinue,
}: OnboardingNavigationProps) {
	return (
		<div className="flex items-center justify-between">
			<div>
				{onBack && (
					<Button size="sm" variant="secondary" onClick={onBack}>
						<Trans>Back</Trans>
					</Button>
				)}
			</div>
			<div>
				{onContinue && (
					<Button size="sm" onClick={onContinue}>
						<Trans>Continue</Trans>
					</Button>
				)}
			</div>
		</div>
	);
}
