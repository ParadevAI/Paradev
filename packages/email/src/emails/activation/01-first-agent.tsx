import { Section, Text } from "@react-email/components";
import { CANONICAL_URLS } from "@superset/shared/constants";
import { Button, EmailLayout } from "../../components";

const utm =
	"?utm_source=email&utm_medium=lifecycle&utm_campaign=activation&utm_content=d1-first-workspace";

interface ActivationNudge1Props {
	userEmail?: string;
	unsubscribeUrl?: string;
}

export function ActivationNudge1({
	userEmail,
	unsubscribeUrl,
}: ActivationNudge1Props = {}) {
	return (
		<EmailLayout
			preview="The agent never touches your working tree."
			recipientEmail={userEmail}
			unsubscribeUrl={unsubscribeUrl}
		>
			<Text className="text-[15px] leading-6 text-foreground m-0 mb-6">
				Get the desktop app and try it on something small, like a flaky test or
				the rename you&apos;ve been putting off.
			</Text>

			<Section className="mb-8">
				<Button href={`${CANONICAL_URLS.MARKETING}/download${utm}`}>
					Get the desktop app
				</Button>
			</Section>

			<Section className="bg-surface border border-solid border-border rounded-lg p-5">
				<Text className="text-[15px] leading-6 text-foreground m-0 mb-3">
					<strong>The agent never touches your working tree.</strong> Every
					workspace is an isolated copy of your repo on its own branch.
				</Text>
				<Text className="text-[15px] leading-6 text-foreground m-0">
					If the result is garbage, delete the workspace. Nothing happened.
				</Text>
			</Section>
		</EmailLayout>
	);
}

export default ActivationNudge1;
