import { Hr, Text } from "@react-email/components";
import { DetailRow, EmailLayout } from "../../components";

interface PlanUpgradedEmailProps {
	ownerName?: string | null;
	organizationName: string;
	planName: string;
	previousPlanName: string;
	billingInterval: "monthly" | "yearly";
	amount: string;
	seatCount: number;
	cloudHoursPerSeat?: number | null;
	previousCloudHoursPerSeat?: number | null;
}

export function PlanUpgradedEmail({
	ownerName = "there",
	organizationName = "Acme Inc",
	planName = "Team",
	previousPlanName = "Pro",
	billingInterval = "monthly",
	amount = "$40.00",
	seatCount = 3,
	cloudHoursPerSeat = 40,
	previousCloudHoursPerSeat = 10,
}: PlanUpgradedEmailProps) {
	const intervalText = billingInterval === "monthly" ? "month" : "year";
	const cloudLine = cloudHoursPerSeat
		? previousCloudHoursPerSeat
			? `Cloud workspaces: ${cloudHoursPerSeat} hours per seat each month, up from ${previousCloudHoursPerSeat}.`
			: `Cloud workspaces: ${cloudHoursPerSeat} hours per seat each month.`
		: null;

	return (
		<EmailLayout preview={`${organizationName} is now on ${planName}.`}>
			<Text className="text-[15px] leading-6 text-foreground m-0 mb-4">
				Hi {ownerName ?? "there"},
			</Text>

			<Text className="text-[15px] leading-6 text-foreground m-0 mb-2">
				Thanks for moving <strong>{organizationName}</strong> from{" "}
				{previousPlanName} to <strong>{planName}</strong>. It&apos;s active now.
			</Text>

			<Hr className="border-border my-4" />
			<DetailRow label="Plan" value={planName} />
			<DetailRow label="Billing" value={`${amount}/${intervalText}`} />
			<DetailRow label="Seats" value={String(seatCount)} />
			<Hr className="border-border my-4" />

			<Text
				className={`text-[15px] leading-6 text-foreground m-0 ${cloudLine ? "mb-2" : "mb-6"}`}
			>
				{planName} includes everything in {previousPlanName}.
			</Text>
			{cloudLine && (
				<Text className="text-[15px] leading-6 text-foreground m-0 mb-6">
					✓ {cloudLine}
				</Text>
			)}

			<Text className="text-[13px] leading-5 text-muted m-0">
				You're receiving this because you're an owner of {organizationName}.
			</Text>
		</EmailLayout>
	);
}

export default PlanUpgradedEmail;
