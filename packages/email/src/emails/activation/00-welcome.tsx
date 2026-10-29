import { Text } from "@react-email/components";
import { EmailLayout } from "../../components";

interface WelcomeEmailProps {
	userName?: string;
	userEmail?: string;
	unsubscribeUrl?: string;
}

export function WelcomeEmail({
	userEmail,
	unsubscribeUrl,
}: WelcomeEmailProps = {}) {
	return (
		<EmailLayout
			preview="How to get the most out of Paradev."
			recipientEmail={userEmail}
			unsubscribeUrl={unsubscribeUrl}
		>
			<Text className="text-[15px] leading-6 text-foreground m-0 mb-6">
				Paradev runs Claude Code, Codex, or any CLI agent in parallel, each in
				an isolated copy of your repo. To get the most out of it:
			</Text>

			<Text className="text-[15px] leading-6 text-foreground m-0 mb-4">
				<strong>1. One workspace per task.</strong> Start a few at once: a bug,
				a small feature, the rename you&apos;ve been putting off.
			</Text>
			<Text className="text-[15px] leading-6 text-foreground m-0 mb-4">
				<strong>2. Let an agent split the work.</strong> Give it a list and say
				&quot;spin up an agent for each of these.&quot; It creates the
				workspaces and checks on each one.
			</Text>
			<Text className="text-[15px] leading-6 text-foreground m-0 mb-6">
				<strong>3. Review the diffs.</strong> Come back when an agent is done,
				read what changed, then merge it or send a follow-up.
			</Text>

			<Text className="text-[13px] leading-5 text-muted m-0">
				Questions? Just reply. We read every message.
			</Text>
		</EmailLayout>
	);
}

export default WelcomeEmail;
