import { Trans } from "@lingui/react/macro";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { PageLink } from "../../../PageLink";
import {
	cardArgs,
	lastThirtyDaysCardArgs,
	StoryLink,
	withSettingsShell,
} from "../../fixtures";
import { AllowanceCard } from "./AllowanceCard";

const meta = {
	title: "Cloud usage/Allowance card",
	component: AllowanceCard,
	decorators: [withSettingsShell],
	args: {
		...cardArgs("northwind"),
		billing: (
			<PageLink>
				<StoryLink to={{ view: "billing" }}>
					<Trans>Billing</Trans>
				</StoryLink>
			</PageLink>
		),
	},
} satisfies Meta<typeof AllowanceCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Northwind: Story = {};
export const Trial: Story = { args: cardArgs("trial") };
export const Prepaid: Story = { args: cardArgs("prepaid") };
export const LimitReached: Story = { args: cardArgs("limitReached") };
export const ToppedUp: Story = { args: cardArgs("toppedUp") };
export const FreeCredit: Story = { args: cardArgs("freeCredit") };
export const ContractOver: Story = { args: cardArgs("contractOver") };
export const NotRead: Story = { args: cardArgs("notRead") };
export const Unbilled: Story = { args: cardArgs("unbilled") };
export const PastPeriod: Story = { args: cardArgs("northwind", 1) };
export const LastThirtyDays: Story = { args: lastThirtyDaysCardArgs() };
/** Packs bought in the period: each purchase restarts billing's count on the carried pack. */
export const PacksBought: Story = { args: cardArgs("reattached") };
/** A monthly row raised by hand above its grant: the period's usage only. */
export const RaisedByHand: Story = { args: cardArgs("raisedByHand") };
/** Overage off, but billing put usage on the priced row: nothing shown over. */
export const OverageOffBilled: Story = { args: cardArgs("overageOffBilled") };
