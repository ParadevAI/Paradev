"use client";

import { i18n } from "@superset/i18n";
import { cn } from "@superset/ui/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { CLOUD_USAGE_NAV_ITEM, NAV_ITEMS } from "./constants";

function isNavItemActive(pathname: string, href: string) {
	return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({
	showCloudUsage,
	onNavigate,
}: {
	showCloudUsage: boolean;
	onNavigate?: () => void;
}) {
	const pathname = usePathname();
	const items = showCloudUsage
		? [...NAV_ITEMS, CLOUD_USAGE_NAV_ITEM]
		: NAV_ITEMS;

	return (
		<nav className="flex flex-col gap-px px-2">
			{items.map((item) => {
				const isActive = isNavItemActive(pathname, item.href);
				const Icon = item.icon;
				const NavLink = item.reloadDocument ? "a" : Link;
				return (
					<NavLink
						key={item.href}
						href={item.href}
						aria-current={isActive ? "page" : undefined}
						onClick={onNavigate}
						className={cn(
							"flex h-7 items-center gap-2 rounded-md px-2 text-[13px] font-medium transition-colors",
							isActive
								? "bg-fill-selected text-foreground"
								: "text-muted-foreground hover:bg-fill-hover hover:text-foreground",
						)}
					>
						<Icon
							className="size-4 shrink-0 text-muted-foreground"
							strokeWidth={1.5}
						/>
						<span className="flex-1 truncate text-left">
							{i18n._(item.label)}
						</span>
					</NavLink>
				);
			})}
		</nav>
	);
}
