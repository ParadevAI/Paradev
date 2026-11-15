import { Section, Text } from "@react-email/components";
import { Button, EmailLayout } from "../../components";

interface UpgradeNudgeEmailProps {
	featureName: string;
	upgradeUrl: string;
	unsubscribeUrl?: string;
}

export function UpgradeNudgeEmail({
	featureName = "Paradev Mobile",
	upgradeUrl = "https://app.superset.sh/settings/billing",
	unsubscribeUrl,
}: UpgradeNudgeEmailProps) {
	return (
		<EmailLayout
			preview={`${featureName} is part of Paradev Pro.`}
			unsubscribeUrl={unsubscribeUrl}
		>
			<Text className="text-[15px] leading-6 text-foreground m-0 mb-4">
				Hi there,
			</Text>

			<Text className="text-[15px] leading-6 text-foreground m-0 mb-4">
				You tried to use <strong>{featureName}</strong> on your phone. It's part
				of Pro, and your organization is on the Free plan.
			</Text>

			<Text className="text-[15px] leading-6 text-foreground m-0 mb-6">
				You can compare plans and upgrade on the web. The mobile app picks up
				the new plan on its own.
			</Text>

			<Section className="mb-6">
				<Button href={upgradeUrl}>See plans</Button>
			</Section>

			<Text className="text-[13px] leading-5 text-muted m-0">
				You're receiving this because you tried a Pro feature in the Paradev
				mobile app. We send this at most once a week.
			</Text>
		</EmailLayout>
	);
}

export default UpgradeNudgeEmail;
