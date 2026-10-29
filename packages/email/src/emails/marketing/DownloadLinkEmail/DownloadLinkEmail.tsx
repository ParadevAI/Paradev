import { Section, Text } from "@react-email/components";
import { CANONICAL_URLS } from "@superset/shared/constants";
import { Button, EmailLayout } from "../../../components";

const DOWNLOAD_URL = `${CANONICAL_URLS.MARKETING}/download?utm_source=email&utm_medium=transactional&utm_campaign=mobile-download-link`;

interface DownloadLinkEmailProps {
	recipientEmail?: string;
}

export function DownloadLinkEmail({
	recipientEmail,
}: DownloadLinkEmailProps = {}) {
	return (
		<EmailLayout
			preview="Your Paradev desktop download link"
			recipientEmail={recipientEmail}
		>
			<Text className="m-0 mb-6 text-[15px] leading-6 text-foreground">
				Open this email on your computer and use the button below. It picks the
				right version for you.
			</Text>

			<Section className="mb-8">
				<Button href={DOWNLOAD_URL}>Download Paradev</Button>
			</Section>

			<Text className="m-0 text-[13px] leading-5 text-muted">
				The desktop app runs on macOS and Linux. Windows isn't supported yet.
			</Text>
		</EmailLayout>
	);
}

export default DownloadLinkEmail;
