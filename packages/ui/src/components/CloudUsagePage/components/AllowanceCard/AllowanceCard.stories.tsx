import { Trans } from "@lingui/react/macro";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
	allowanceFixtures,
	periods,
	StoryLink,
	unavailableFixtures,
	usageFixtures,
	withSettingsShell,
} from "../../fixtures";
import { MoreLink } from "../MoreLink";
import { AllowanceCard } from "./AllowanceCard";

const card = (
	allowance: keyof typeof allowanceFixtures,
	unavailable: keyof typeof unavailableFixtures = "none",
) => ({
	period: periods({
		allowance: allowanceFixtures[allowance],
		unavailable: unavailableFixtures[unavailable],
	}).items[0],
	allowance: allowanceFixtures[allowance],
});

const meta = {
	title: "Cloud usage/Allowance card",
	component: AllowanceCard,
	decorators: [withSettingsShell],
	args: {
		total: usageFixtures.byDay.total,
		...card("freeCredits"),
		billing: (
			<MoreLink Link={StoryLink} to={{ view: "billing" }}>
				<Trans>Billing</Trans>
			</MoreLink>
		),
	},
} satisfies Meta<typeof AllowanceCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FreeCredits: Story = {};
export const SeatsOnly: Story = { args: card("seatsOnly") };
export const Over: Story = { args: card("over") };
export const Bought: Story = { args: card("bought") };
export const LimitReached: Story = { args: card("limitReached") };
export const PercentCap: Story = {
	args: card("percentCap", "percentCap"),
};
export const NotRead: Story = {
	args: card("notRead", "notRead"),
};
export const PastPeriod: Story = {
	args: {
		period: periods({
			allowance: null,
			unavailable: unavailableFixtures.none,
		}).items[1],
		allowance: null,
	},
};
export const LastThirtyDays: Story = {
	args: {
		total: usageFixtures.byDay.total,
		period: undefined,
		allowance: null,
	},
};
