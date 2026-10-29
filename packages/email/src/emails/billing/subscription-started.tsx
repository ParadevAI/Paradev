import { Hr, Text } from "@react-email/components";
import { DetailRow, EmailLayout } from "../../components";

interface SubscriptionStartedEmailProps {
	ownerName?: string | null;
	organizationName: string;
	planName: string;
	billingInterval: "monthly" | "yearly";
	amount: string;
	seatCount: number;
	/** The plan one step below, when this plan builds on another paid plan. */
	previousPlanName?: string | null;
	cloudHoursPerSeat?: number | null;
}

export function planFeatureLines({
	previousPlanName,
	cloudHoursPerSeat,
}: Pick<
	SubscriptionStartedEmailProps,
	"previousPlanName" | "cloudHoursPerSeat"
>): string[] {
	const cloud = cloudHoursPerSeat
		? [`Cloud workspaces: ${cloudHoursPerSeat} hours per seat each month`]
		: [];
	if (previousPlanName) return [`Everything in ${previousPlanName}`, ...cloud];
	return [
		...cloud,
		"Remote access",
		"Automations",
		"Linear and Slack integrations",
		"Mobile",
	];
}

export function SubscriptionStartedEmail({
	ownerName = "there",
	organizationName = "Acme Inc",
	planName = "Pro",
	billingInterval = "monthly",
	amount = "$10.00",
	seatCount = 1,
	previousPlanName = null,
	cloudHoursPerSeat = null,
}: SubscriptionStartedEmailProps) {
	const intervalText = billingInterval === "monthly" ? "month" : "year";
	const features = planFeatureLines({ previousPlanName, cloudHoursPerSeat });

	return (
		<EmailLayout preview={`Welcome to Paradev ${planName}!`}>
			<Text className="text-[15px] leading-6 text-foreground m-0 mb-4">
				Hi {ownerName ?? "there"},
			</Text>

			<Text className="text-[15px] leading-6 text-foreground m-0 mb-2">
				Thanks for upgrading <strong>{organizationName}</strong> to the{" "}
				<strong>{planName}</strong> plan. Your subscription is now active.
			</Text>

			<Hr className="border-border my-4" />
			<DetailRow label="Plan" value={planName} />
			<DetailRow label="Billing" value={`${amount}/${intervalText}`} />
			<DetailRow label="Seats" value={String(seatCount)} />
			<Hr className="border-border my-4" />

			<Text className="text-[15px] leading-6 text-foreground m-0 mb-2">
				{planName} includes:
			</Text>

			<Text className="text-[15px] leading-7 text-foreground m-0 mb-6">
				{features.map((feature, index) => (
					<span key={feature}>
						{index > 0 && <br />}✓ {feature}
					</span>
				))}
			</Text>

			<Text className="text-[13px] leading-5 text-muted m-0">
				You're receiving this because you're an owner of {organizationName}.
			</Text>
		</EmailLayout>
	);
}

export default SubscriptionStartedEmail;
