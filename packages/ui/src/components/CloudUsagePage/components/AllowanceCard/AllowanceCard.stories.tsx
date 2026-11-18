import { Trans } from "@lingui/react/macro";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
	allowanceFixtures,
	periods,
	StoryLink,
	unavailableFixtures,
	usageFixtures,
	withoutRate,
	withSettingsShell,
} from "../../fixtures";
import { MoreLink } from "../MoreLink";
import { AllowanceCard } from "./AllowanceCard";

const period = (
	allowance: keyof typeof allowanceFixtures,
	unavailable: keyof typeof unavailableFixtures = "none",
) =>
	periods({
		allowance: allowanceFixtures[allowance],
		unavailable: unavailableFixtures[unavailable],
	}).items[0];

const meta = {
	title: "Cloud usage/Allowance card",
	component: AllowanceCard,
	decorators: [withSettingsShell],
	args: {
		total: usageFixtures.byDay.total,
		period: period("freeCredits"),
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
export const SeatsOnly: Story = { args: { period: period("seatsOnly") } };
export const Over: Story = { args: { period: period("over") } };
export const Bought: Story = { args: { period: period("bought") } };
export const LimitReached: Story = { args: { period: period("limitReached") } };
export const PercentCap: Story = {
	args: { period: period("percentCap", "percentCap") },
};
export const NotRead: Story = {
	args: { period: period("notRead", "notRead") },
};
export const NoRate: Story = {
	args: {
		total: withoutRate(usageFixtures.byDay).total,
		period: period("noRate"),
	},
};
export const PastPeriod: Story = {
	args: {
		period: periods({
			allowance: null,
			unavailable: unavailableFixtures.none,
		}).items[1],
	},
};
export const LastThirtyDays: Story = {
	args: { total: withoutRate(usageFixtures.byDay).total, period: undefined },
};
