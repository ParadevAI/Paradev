import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import type { ReactNode } from "react";

interface OnboardingNavigationProps {
	onBack: (() => void) | null;
	onContinue: (() => void) | null;
	continueButton?: ReactNode;
}

export function OnboardingNavigation({
	onBack,
	onContinue,
	continueButton,
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
				{continueButton ??
					(onContinue && (
						<Button size="sm" onClick={onContinue}>
							<Trans>Continue</Trans>
						</Button>
					))}
			</div>
		</div>
	);
}
