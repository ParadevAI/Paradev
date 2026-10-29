"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import {
	isSupportedLocale,
	LOCALE_COOKIE,
	LOCALE_LABELS,
	SUPPORTED_LOCALES,
	type SupportedLocale,
} from "@superset/i18n";
import { COMPANY } from "@superset/shared/constants";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { m } from "framer-motion";
import { ArrowUpRight, Check, ChevronDown, Languages } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { FaApple } from "react-icons/fa";
import { track } from "@/lib/analytics";
import { Soc2Badge } from "../Soc2Badge";
import { SocialLinks } from "../SocialLinks";

function SupersetLogo() {
	return (
		<svg
			width="140"
			height="26"
			viewBox="0 0 270 50"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			aria-label="Paradev"
		>
			<title>Paradev</title>
			<path
				d="M0 0H30V10H0ZM40 0H70V10H40ZM80 0H110V10H80ZM120 0H150V10H120ZM160 0H180V10H160ZM200 0H230V10H200ZM240 0H250V10H240ZM260 0H270V10H260ZM0 10H10V20H0ZM20 10H30V20H20ZM40 10H50V20H40ZM60 10H70V20H60ZM80 10H90V20H80ZM100 10H110V20H100ZM120 10H130V20H120ZM140 10H150V20H140ZM160 10H170V20H160ZM180 10H190V20H180ZM200 10H210V20H200ZM240 10H250V20H240ZM260 10H270V20H260ZM0 20H30V30H0ZM40 20H70V30H40ZM80 20H100V30H80ZM120 20H150V30H120ZM160 20H170V30H160ZM180 20H190V30H180ZM200 20H220V30H200ZM240 20H250V30H240ZM260 20H270V30H260ZM0 30H10V40H0ZM40 30H50V40H40ZM60 30H70V40H60ZM80 30H90V40H80ZM100 30H110V40H100ZM120 30H130V40H120ZM140 30H150V40H140ZM160 30H170V40H160ZM180 30H190V40H180ZM200 30H210V40H200ZM240 30H250V40H240ZM260 30H270V40H260ZM0 40H10V50H0ZM40 40H50V50H40ZM60 40H70V50H60ZM80 40H90V50H80ZM100 40H110V50H100ZM120 40H130V50H120ZM140 40H150V50H140ZM160 40H180V50H160ZM200 40H230V50H200ZM250 40H260V50H250Z"
				fill="currentColor"
			/>
		</svg>
	);
}

interface FooterLink {
	href: string;
	label: ReactNode;
	external?: boolean;
}

const PRODUCT_LINKS: FooterLink[] = [
	{
		href: "/download",
		label: <Trans>Download</Trans>,
	},
	{
		href: "/mobile",
		label: <Trans>Mobile</Trans>,
	},
	{
		href: "/pages",
		label: <Trans>Pages</Trans>,
	},
	{
		href: "/automations",
		label: <Trans>Automations</Trans>,
	},
	{
		href: "/browser",
		label: <Trans>Browser</Trans>,
	},
	{
		href: "/leaderboard",
		label: <Trans>Leaderboard</Trans>,
	},
	{
		href: "/#how-it-works",
		label: <Trans>How it works</Trans>,
	},
	{
		href: "/#features",
		label: <Trans>Features</Trans>,
	},
	{
		href: "/#security",
		label: <Trans>Security</Trans>,
	},
	{ href: "/mcp-install", label: "MCP" },
	{
		href: "/marketplace",
		label: <Trans>Marketplace</Trans>,
	},
	{
		href: "/compare",
		label: <Trans>Compare</Trans>,
	},
];

const COMPANY_LINKS: FooterLink[] = [
	{
		href: "/team",
		label: <Trans>About</Trans>,
	},
	{
		href: "/contact",
		label: <Trans>Contact</Trans>,
	},
	{
		href: "/careers",
		label: <Trans>Careers</Trans>,
	},
	{
		href: "/press",
		label: <Trans>Press</Trans>,
	},
	{
		href: "/media",
		label: <Trans>Media kit</Trans>,
	},
	{
		href: COMPANY.STATUS_URL,
		label: <Trans>Status</Trans>,
		external: true,
	},
];

const RESOURCE_LINKS: FooterLink[] = [
	{
		href: COMPANY.DOCS_URL,
		label: <Trans>Documentation</Trans>,
		external: true,
	},
	{
		href: "/pricing",
		label: <Trans>Pricing</Trans>,
	},
	{
		href: "/blog",
		label: <Trans>Blog</Trans>,
	},
	{
		href: "/parallel-coding-agents",
		label: <Trans>Parallel agents guide</Trans>,
	},
	{
		href: "/agent-orchestration",
		label: <Trans>Orchestration guide</Trans>,
	},
	{
		href: "/community",
		label: <Trans>Community</Trans>,
	},
	{
		href: "/enterprise",
		label: <Trans>Enterprise</Trans>,
	},
	{
		href: "/changelog",
		label: <Trans>Changelog</Trans>,
	},
	{
		href: "/roadmap",
		label: <Trans>Roadmap</Trans>,
	},
];

const LEGAL_LINKS: FooterLink[] = [
	{
		href: "/security",
		label: <Trans>Security</Trans>,
	},
	{
		href: "/terms",
		label: <Trans>Terms</Trans>,
	},
	{
		href: "/privacy",
		label: <Trans>Privacy</Trans>,
	},
];

export function Footer({
	locale,
	year,
}: {
	locale?: SupportedLocale;
	year: number;
}) {
	const pathname = usePathname();
	if (pathname === "/download") return null;

	return (
		<footer className="border-t border-border bg-background">
			<m.div
				initial={{ opacity: 0 }}
				whileInView={{ opacity: 1 }}
				viewport={{ once: true }}
				transition={{ duration: 0.5 }}
				className="max-w-7xl mx-auto px-6 sm:px-8 py-14 sm:py-20"
			>
				<div className="grid grid-cols-2 gap-10 md:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] md:gap-x-16">
					<div className="col-span-2 flex flex-col gap-6 md:col-span-1">
						<Link
							href="/"
							className="inline-block text-foreground transition-colors hover:text-foreground/80"
						>
							<SupersetLogo />
						</Link>
						<div className="-ml-2 flex items-center gap-2">
							<SocialLinks />
							<a
								href={COMPANY.APP_STORE_URL}
								target="_blank"
								rel="noopener noreferrer"
								aria-label="App Store"
								className="text-muted-foreground hover:text-foreground transition-colors p-1 sm:p-2"
								onClick={() =>
									track("mobile_store_clicked", {
										store: "app_store",
										source: "footer",
									})
								}
							>
								<FaApple aria-hidden="true" className="size-5" />
							</a>
						</div>
						<a
							href={COMPANY.TRUST_URL}
							target="_blank"
							rel="noopener noreferrer"
							className="w-max text-muted-foreground transition-colors hover:text-foreground"
						>
							<Soc2Badge size={80} />
						</a>
						<p className="text-sm text-muted-foreground">
							<Trans>© {year} Superset Inc.</Trans>
						</p>
						<FooterLanguageSwitcher locale={locale} />
					</div>

					<FooterColumn title={<Trans>Product</Trans>} links={PRODUCT_LINKS} />
					<FooterColumn title={<Trans>Company</Trans>} links={COMPANY_LINKS} />
					<FooterColumn
						title={<Trans>Resources</Trans>}
						links={RESOURCE_LINKS}
					/>
					<FooterColumn title={<Trans>Legal</Trans>} links={LEGAL_LINKS} />
				</div>
			</m.div>
		</footer>
	);
}

function FooterColumn({
	title,
	links,
}: {
	title: ReactNode;
	links: FooterLink[];
}) {
	return (
		<div className="flex flex-col gap-4">
			<p className="text-sm font-medium text-foreground">{title}</p>
			<ul className="flex flex-col gap-3">
				{links.map((link) => (
					<li key={link.href}>
						<FooterLinkItem link={link} />
					</li>
				))}
			</ul>
		</div>
	);
}

function FooterLinkItem({ link }: { link: FooterLink }) {
	const className =
		"group inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground";
	if (link.external) {
		return (
			<a
				href={link.href}
				target="_blank"
				rel="noopener noreferrer"
				className={className}
			>
				{link.label}
				<ArrowUpRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
			</a>
		);
	}
	return (
		<Link href={link.href} className={className}>
			{link.label}
		</Link>
	);
}

function FooterLanguageSwitcher({ locale }: { locale?: SupportedLocale }) {
	const { t, i18n } = useLingui();
	const pathname = usePathname() ?? "/";
	// The server passes the URL's locale; every switch is a full navigation,
	// so the value never changes within a page's lifetime and needs no
	// subscription. The i18n fallback covers renders outside the [lang] tree.
	const current = locale ?? (i18n.locale as SupportedLocale);
	// The URL carries the locale, so applying a choice is a navigation: strip
	// any current locale prefix, then go to the same page under the new one
	// (bare for English). The cookie still records the choice for the
	// client-resolved apps (docs, web).
	const selectLocale = (next: SupportedLocale) => {
		track("language_switched", { from: current, to: next, surface: "footer" });
		const segments = pathname.split("/");
		const barePath = isSupportedLocale(segments[1] ?? "")
			? `/${segments.slice(2).join("/")}`
			: pathname;
		// biome-ignore lint/suspicious/noDocumentCookie: the Cookie Store API is still not available in all supported browsers, and the page navigates immediately after this write.
		document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; SameSite=Lax`;
		window.location.assign(
			next === "en"
				? barePath || "/"
				: `/${next}${barePath === "/" ? "" : barePath}`,
		);
	};
	return (
		<DropdownMenu modal={false}>
			<DropdownMenuTrigger
				aria-label={`${t({
					message: "Language",
				})}: ${LOCALE_LABELS[current]}`}
				className="group flex w-max cursor-pointer items-center gap-2 text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground"
			>
				<Languages aria-hidden className="size-4 shrink-0" />
				<span lang={current}>{LOCALE_LABELS[current]}</span>
				<ChevronDown
					aria-hidden
					className="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-180"
				/>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				side="bottom"
				align="start"
				sideOffset={8}
				className="max-h-[min(38rem,var(--radix-dropdown-menu-content-available-height))] w-48 overflow-y-auto rounded-[5px] border border-border bg-background p-1 shadow-lg"
			>
				{SUPPORTED_LOCALES.map((option) => (
					<DropdownMenuItem
						key={option}
						lang={option}
						aria-current={option === current || undefined}
						onClick={() => {
							// Re-selecting the active locale would be a pointless
							// full navigation to the same URL.
							if (option !== current) selectLocale(option);
						}}
						className="flex cursor-pointer items-center justify-between gap-3 rounded-[3px] px-2.5 py-1.5 text-sm"
					>
						{LOCALE_LABELS[option]}
						{option === current && (
							<Check aria-hidden className="size-3.5 shrink-0" />
						)}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
