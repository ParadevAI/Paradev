import { Section, Text } from "@react-email/components";
import { Button, EmailLayout } from "../../components";

interface UpgradeNudgeEmailProps {
	recipientName?: string | null;
	featureName: string;
	organizationName?: string | null;
	upgradeUrl: string;
}

export function UpgradeNudgeEmail({
	recipientName = "there",
	featureName = "Paradev Mobile",
	organizationName = "Acme Inc",
	upgradeUrl = "https://app.superset.sh/settings/billing",
}: UpgradeNudgeEmailProps) {
	return (
		<EmailLayout preview={`${featureName} is part of Paradev Pro.`}>
			<Text className="text-[15px] leading-6 text-foreground m-0 mb-4">
				Hi {recipientName ?? "there"},
			</Text>

			<Text className="text-[15px] leading-6 text-foreground m-0 mb-4">
				You tried to use <strong>{featureName}</strong> on your phone. It's part
				of Pro
				{organizationName ? (
					<>
						, and <strong>{organizationName}</strong> is on the Free plan
					</>
				) : null}
				.
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
