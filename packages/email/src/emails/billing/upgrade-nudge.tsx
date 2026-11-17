import { Link, Text } from "@react-email/components";
import { PersonalLayout } from "../../components";

const paragraph = {
	margin: "0 0 16px 0",
	fontFamily: "Arial, Helvetica, sans-serif",
	fontSize: "14px",
	lineHeight: "21px",
	color: "#222222",
} as const;

interface UpgradeNudgeEmailProps {
	featureName: string;
	upgradeUrl: string;
	unsubscribeUrl?: string;
}

export function UpgradeNudgeEmail({
	featureName = "Paradev Mobile",
	upgradeUrl = "https://app.paradev.com/settings/billing",
	unsubscribeUrl,
}: UpgradeNudgeEmailProps) {
	return (
		<PersonalLayout
			preview={`I saw you tried ${featureName} on your phone.`}
			unsubscribeUrl={unsubscribeUrl}
		>
			<Text style={paragraph}>Hey there,</Text>
			<Text style={paragraph}>
				I&apos;m Kiet, one of the founders of Paradev. I saw you tried{" "}
				{featureName} on your phone. That&apos;s part of Pro, and your team is
				on the Free plan.
			</Text>
			<Text style={paragraph}>
				You can <Link href={upgradeUrl}>upgrade on the web</Link>, and the app
				picks up the new plan on its own.
			</Text>
			<Text style={{ ...paragraph, margin: 0 }}>Kiet</Text>
		</PersonalLayout>
	);
}

export default UpgradeNudgeEmail;
