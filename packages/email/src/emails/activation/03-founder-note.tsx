import { Body, Head, Html, Preview, Text } from "@react-email/components";

const paragraph = {
	margin: "0 0 16px 0",
	fontFamily: "Arial, Helvetica, sans-serif",
	fontSize: "14px",
	lineHeight: "21px",
	color: "#222222",
} as const;

interface ActivationNudge2Props {
	userName?: string;
}

export function ActivationNudge2({
	userName = "there",
}: ActivationNudge2Props = {}) {
	return (
		<Html>
			<Head />
			<Preview>
				Looks like you signed up last week but haven&apos;t started a workspace
				yet.
			</Preview>
			<Body style={{ margin: 0, backgroundColor: "#FFFFFF" }}>
				<Text style={paragraph}>Hey {userName},</Text>
				<Text style={paragraph}>
					I&apos;m Kiet, one of the founders of Paradev. Looks like you signed
					up last week but haven&apos;t started a workspace yet.
				</Text>
				<Text style={paragraph}>
					Did something break? Even one word helps: download, setup, trust, or
					busy.
				</Text>
				<Text style={{ ...paragraph, margin: 0 }}>Kiet</Text>
			</Body>
		</Html>
	);
}

export default ActivationNudge2;
