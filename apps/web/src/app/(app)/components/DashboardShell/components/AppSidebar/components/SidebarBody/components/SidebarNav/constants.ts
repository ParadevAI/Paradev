import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import {
	Blocks,
	Bot,
	CreditCard,
	Home,
	type LucideIcon,
	User,
} from "lucide-react";

export interface NavItem {
	href: string;
	label: MessageDescriptor;
	icon: LucideIcon;
	/** Served by another deployment through a rewrite, so client navigation cannot reach it. */
	reloadDocument?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
	{ href: "/", label: msg({ message: "Home" }), icon: Home },
	{
		href: "/agents",
		label: msg({ message: "Agents" }),
		icon: Bot,
		reloadDocument: true,
	},
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
];
