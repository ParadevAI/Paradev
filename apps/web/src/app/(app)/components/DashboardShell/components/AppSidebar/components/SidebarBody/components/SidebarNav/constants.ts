import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import {
	Blocks,
	Bot,
	Cloud,
	CreditCard,
	Home,
	type LucideIcon,
	User,
} from "lucide-react";
import type { FeatureFlags } from "../../../../../../../../providers/FeatureFlagsProvider";

export interface NavItem {
	href: string;
	label: MessageDescriptor;
	icon: LucideIcon;
	/** Served by another deployment through a rewrite, so client navigation cannot reach it. */
	reloadDocument?: boolean;
	/** Shown only when this flag is on for the active organization. */
	flag?: keyof FeatureFlags;
}

export const NAV_ITEMS: NavItem[] = [
	{ href: "/", label: msg({ message: "Home" }), icon: Home },
	...(process.env.AGENTS_ENABLED
		? [
				{
					href: "/agents",
					label: msg({ message: "Agents" }),
					icon: Bot,
					reloadDocument: true,
				},
			]
		: []),
	{
		href: "/integrations",
		label: msg({ message: "Integrations" }),
		icon: Blocks,
	},
	{
		href: "/settings/account",
		label: msg({ message: "Account" }),
		icon: User,
	},
	{
		href: "/settings/billing",
		label: msg({ message: "Billing" }),
		icon: CreditCard,
	},
	{
		href: "/settings/cloud-usage",
		label: msg({ message: "Cloud usage" }),
		icon: Cloud,
		flag: "cloudUsage",
	},
];
