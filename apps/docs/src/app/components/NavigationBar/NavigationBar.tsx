"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { LanguageSwitcher } from "@superset/i18n/react";
import { COMPANY } from "@superset/shared/constants";
import { Languages, Menu } from "lucide-react";
import Link from "next/link";
import posthog from "posthog-js";
import { MobileSearchIcon } from "@/app/(docs)/[[...slug]]/components/DocsPageLayout/components/PageClient/components/MobileSearchIcon";
import {
	NavigationMobile,
	useNavbarMobile,
} from "./components/NavigationMobile";

function SupersetLogo() {
	return (
		<svg
			viewBox="0 0 270 50"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			aria-label="Paradev"
			className="h-5 w-auto"
		>
			<title>Paradev</title>
			<path
				d="M0 0H30V10H0ZM40 0H70V10H40ZM80 0H110V10H80ZM120 0H150V10H120ZM160 0H180V10H160ZM200 0H230V10H200ZM240 0H250V10H240ZM260 0H270V10H260ZM0 10H10V20H0ZM20 10H30V20H20ZM40 10H50V20H40ZM60 10H70V20H60ZM80 10H90V20H80ZM100 10H110V20H100ZM120 10H130V20H120ZM140 10H150V20H140ZM160 10H170V20H160ZM180 10H190V20H180ZM200 10H210V20H200ZM240 10H250V20H240ZM260 10H270V20H260ZM0 20H30V30H0ZM40 20H70V30H40ZM80 20H100V30H80ZM120 20H150V30H120ZM160 20H170V30H160ZM180 20H190V30H180ZM200 20H220V30H200ZM240 20H250V30H240ZM260 20H270V30H260ZM0 30H10V40H0ZM40 30H50V40H40ZM60 30H70V40H60ZM80 30H90V40H80ZM100 30H110V40H100ZM120 30H130V40H120ZM140 30H150V40H140ZM160 30H170V40H160ZM180 30H190V40H180ZM200 30H210V40H200ZM240 30H250V40H240ZM260 30H270V40H260ZM0 40H10V50H0ZM40 40H50V50H40ZM60 40H70V50H60ZM80 40H90V50H80ZM100 40H110V50H100ZM120 40H130V50H120ZM140 40H150V50H140ZM160 40H180V50H160ZM200 40H230V50H200ZM250 40H260V50H250Z"
				fill="currentColor"
			/>
		</svg>
	);
}

function SidebarTrigger() {
	const { toggleNavbar } = useNavbarMobile();
	const { t } = useLingui();

	return (
		<button
			type="button"
			aria-label={t({
				message: "Toggle sidebar",
			})}
			className="navbar:hidden flex items-center justify-center p-2"
			onClick={toggleNavbar}
		>
			<Menu className="size-5" />
		</button>
	);
}

export default function NavigationBar() {
	const { t } = useLingui();

	return (
		<div className="flex flex-col sticky top-0 bg-background backdrop-blur-md z-30">
			<div
				aria-hidden
				className="pointer-events-none absolute inset-x-0 top-full h-5 bg-gradient-to-b from-background to-transparent"
			/>
			<nav className="md:grid grid-cols-12 flex items-center justify-between">
				<a
					href={COMPANY.MARKETING_URL}
					className="md:px-5 px-2.5 py-4 text-foreground md:col-span-2 shrink-0 transition-colors md:w-[268px] lg:w-[286px]"
				>
					<SupersetLogo />
				</a>
				<div className="md:col-span-10 flex items-center justify-end relative px-4 gap-4">
					<MobileSearchIcon />
					<SidebarTrigger />
					<ul className="navbar:flex items-center gap-2 hidden shrink-0">
						<NavLink href={COMPANY.CHANGELOG_URL} external>
							<Trans>Changelog</Trans>
						</NavLink>
						<NavLink href={COMPANY.MARKETING_URL} external>
							<Trans>Website</Trans>
						</NavLink>
						<NavLink
							href="https://github.com/paradevai/paradev"
							external
							aria-label={t({
								message: "View Paradev repository on GitHub",
							})}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="1.4em"
								height="1.4em"
								viewBox="0 0 496 512"
								aria-hidden="true"
							>
								<path
									fill="currentColor"
									d="M165.9 397.4c0 2-2.3 3.6-5.2 3.6c-3.3.3-5.6-1.3-5.6-3.6c0-2 2.3-3.6 5.2-3.6c3-.3 5.6 1.3 5.6 3.6m-31.1-4.5c-.7 2 1.3 4.3 4.3 4.9c2.6 1 5.6 0 6.2-2s-1.3-4.3-4.3-5.2c-2.6-.7-5.5.3-6.2 2.3m44.2-1.7c-2.9.7-4.9 2.6-4.6 4.9c.3 2 2.9 3.3 5.9 2.6c2.9-.7 4.9-2.6 4.6-4.6c-.3-1.9-3-3.2-5.9-2.9M244.8 8C106.1 8 0 113.3 0 252c0 110.9 69.8 205.8 169.5 239.2c12.8 2.3 17.3-5.6 17.3-12.1c0-6.2-.3-40.4-.3-61.4c0 0-70 15-84.7-29.8c0 0-11.4-29.1-27.8-36.6c0 0-22.9-15.7 1.6-15.4c0 0 24.9 2 38.6 25.8c21.9 38.6 58.6 27.5 72.9 20.9c2.3-16 8.8-27.1 16-33.7c-55.9-6.2-112.3-14.3-112.3-110.5c0-27.5 7.6-41.3 23.6-58.9c-2.6-6.5-11.1-33.3 2.6-67.9c20.9-6.5 69 27 69 27c20-5.6 41.5-8.5 62.8-8.5s42.8 2.9 62.8 8.5c0 0 48.1-33.6 69-27c13.7 34.7 5.2 61.4 2.6 67.9c16 17.7 25.8 31.5 25.8 58.9c0 96.5-58.9 104.2-114.8 110.5c9.2 7.9 17 22.9 17 46.4c0 33.7-.3 75.4-.3 83.6c0 6.5 4.6 14.4 17.3 12.1C428.2 457.8 496 362.9 496 252C496 113.3 383.5 8 244.8 8M97.2 352.9c-1.3 1-1 3.3.7 5.2c1.6 1.6 3.9 2.3 5.2 1c1.3-1 1-3.3-.7-5.2c-1.6-1.6-3.9-2.3-5.2-1m-10.8-8.1c-.7 1.3.3 2.9 2.3 3.9c1.6 1 3.6.7 4.3-.7c.7-1.3-.3-2.9-2.3-3.9c-2-.6-3.6-.3-4.3.7m32.4 35.6c-1.6 1.3-1 4.3 1.3 6.2c2.3 2.3 5.2 2.6 6.5 1c1.3-1.3.7-4.3-1.3-6.2c-2.2-2.3-5.2-2.6-6.5-1m-11.4-14.7c-1.6 1-1.6 3.6 0 5.9s4.3 3.3 5.6 2.3c1.6-1.3 1.6-3.9 0-6.2c-1.4-2.3-4-3.3-5.6-2"
								></path>
							</svg>
						</NavLink>
						{/* Icon-only: the navbar is tight, so the trigger is just the
						    translation glyph; the real select sits on top invisibly,
						    keeping the native accessible menu. */}
						<li className="relative flex items-center px-1 text-muted-foreground transition-colors focus-within:text-foreground hover:text-foreground">
							<Languages aria-hidden className="size-[1.35em]" />
							<LanguageSwitcher
								label={t({ message: "Language" })}
								className="absolute inset-0 cursor-pointer opacity-0"
								onChange={(next, current) =>
									posthog.capture("language_switched", {
										from: current,
										to: next,
										surface: "docs-nav",
									})
								}
							/>
						</li>
						<a
							href={`${COMPANY.MARKETING_URL}/download`}
							className="ml-2 rounded-md bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-85"
						>
							<Trans>Download</Trans>
						</a>
					</ul>
				</div>
			</nav>
			<NavigationMobile />
		</div>
	);
}

interface NavLinkProps {
	href: string;
	children: React.ReactNode;
	external?: boolean;
	className?: string;
	"aria-label"?: string;
}

function NavLink({
	href,
	children,
	external,
	className,
	...props
}: NavLinkProps) {
	const baseClasses =
		"px-4 py-2 text-sm hover:text-foreground transition-colors text-muted-foreground";

	if (external) {
		return (
			<a
				href={href}
				target="_blank"
				rel="noopener noreferrer"
				className={`${baseClasses} ${className || ""}`}
				{...props}
			>
				{children}
			</a>
		);
	}

	return (
		<Link
			href={href}
			className={`${baseClasses} ${className || ""}`}
			{...props}
		>
			{children}
		</Link>
	);
}
