import { Trans } from "@lingui/react/macro";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
	cardArgs,
	lastThirtyDaysCardArgs,
	StoryLink,
	withSettingsShell,
} from "../../fixtures";
import { MoreLink } from "../MoreLink";
import { AllowanceCard } from "./AllowanceCard";

const meta = {
	title: "Cloud usage/Allowance card",
	component: AllowanceCard,
	decorators: [withSettingsShell],
	args: {
		...cardArgs("northwind"),
		billing: (
			<MoreLink Link={StoryLink} to={{ view: "billing" }}>
				<Trans>Billing</Trans>
			</MoreLink>
		),
	},
} satisfies Meta<typeof AllowanceCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Northwind: Story = {};
export const Trial: Story = { args: cardArgs("trial") };
export const Prepaid: Story = { args: cardArgs("prepaid") };
export const LimitReached: Story = { args: cardArgs("limitReached") };
export const PercentCap: Story = { args: cardArgs("percentCap") };
export const NotRead: Story = { args: cardArgs("notRead") };
export const Unbilled: Story = { args: cardArgs("unbilled") };
export const PastPeriod: Story = { args: cardArgs("northwind", 1) };
export const LastThirtyDays: Story = { args: lastThirtyDaysCardArgs() };
