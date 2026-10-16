import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { coupons } from "../../../stripeFixtures";
import { CouponList } from "./CouponList";

const meta = {
	component: CouponList,
	decorators: [
		(Story) => (
			<div className="max-w-xl rounded-lg border border-border bg-card p-4">
				<Story />
			</div>
		),
	],
	args: { coupons, value: "WINBACK25", onChange: fn(), disabled: false },
} satisfies Meta<typeof CouponList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Disabled: Story = { args: { disabled: true } };
