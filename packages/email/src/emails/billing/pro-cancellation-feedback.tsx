import { Body, Head, Html, Preview, Text } from "@react-email/components";

const paragraph = {
	margin: "0 0 16px 0",
	fontFamily: "Arial, Helvetica, sans-serif",
	fontSize: "14px",
	lineHeight: "21px",
	color: "#222222",
} as const;

export function ProCancellationFeedbackEmail() {
	return (
		<Html>
			<Head />
			<Preview>I saw you cancelled Pro.</Preview>
			<Body style={{ margin: 0, backgroundColor: "#FFFFFF" }}>
				<Text style={paragraph}>Hey there,</Text>
				<Text style={paragraph}>
					I&apos;m Kiet, one of the founders of Paradev. I saw you cancelled
					Pro.
				</Text>
				<Text style={paragraph}>
					What made you cancel? Even one word helps: missing feature, bug,
					price, or didn&apos;t need it.
				</Text>
				<Text style={paragraph}>Thanks for giving Paradev a try.</Text>
				<Text style={{ ...paragraph, margin: 0 }}>Kiet</Text>
			</Body>
		</Html>
	);
}

export default ProCancellationFeedbackEmail;
