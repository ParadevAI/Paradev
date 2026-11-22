import { msg } from "@lingui/core/macro";
import { DEFAULT_LOCALE, getLocaleMessages } from "@superset/i18n";
import { getI18nInstance } from "@superset/i18n/server";
import { BRAND } from "@superset/shared/brand";
import { COMPANY, SOCIAL } from "@superset/shared/constants";
import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { Suspense } from "react";
import { CookieConsent } from "@/components/CookieConsent";
import { ExternalTracking } from "@/components/ExternalTracking";
import {
	OrganizationJsonLd,
	SoftwareApplicationJsonLd,
	WebsiteJsonLd,
} from "@/components/JsonLd";
import { getChangelogEntries } from "@/lib/changelog";
import { REDDIT_PIXEL_ID } from "@/lib/constants";

import { CTAButtons } from "./components/CTAButtons";
import { Footer } from "./components/Footer";
import { GitHubStarCounter } from "./components/GitHubStarCounter";
import { Header } from "./components/Header";
import "../globals.css";
import { initServerI18n } from "../i18n-server";
import { Providers } from "../providers";

const geistMono = Geist_Mono({
	subsets: ["latin"],
	variable: "--font-geist-mono",
	display: "swap",
	// Not used by the LCP hero text; keep it off the critical preload path
	preload: false,
});

const geist = Geist({
	subsets: ["latin"],
	variable: "--font-geist-sans",
	display: "swap",
});

const siteDescription = msg({
	message:
		"The open-source workspace for Claude Code, Codex, OpenCode, and any agent, locally or in the cloud. Run tasks in parallel on separate branches, and review everything in one place.",
});

export async function generateMetadata(): Promise<Metadata> {
	const i18n = getI18nInstance(await initServerI18n());
	const description = `${BRAND.INTRO_NAME}: ${i18n._(siteDescription)}`;
	return {
		metadataBase: new URL(COMPANY.MARKETING_URL),
		title: {
			default: `${BRAND.INTRO_NAME} - Run an army of coding agents`,
			template: `%s | ${BRAND.NAME}`,
		},
		description,
		keywords: [
			"coding agents",
			"parallel execution",
			"developer tools",
			"AI coding",
			"git worktrees",
			"code automation",
			"open source",
			"Claude Code",
			"Cursor",
			"Codex",
		],
		authors: [{ name: `${BRAND.NAME} Team` }],
		creator: BRAND.NAME,
		openGraph: {
			type: "website",
			locale: "en_US",
			url: COMPANY.MARKETING_URL,
			siteName: BRAND.NAME,
			title: `${BRAND.INTRO_NAME} - Run an army of coding agents`,
			description,
			images: [
				{
					url: "/og-image.png",
					width: 2400,
					height: 1260,
					alt: `${BRAND.INTRO_NAME} - Run an army of coding agents`,
				},
			],
		},
		twitter: {
			card: "summary_large_image",
			title: `${BRAND.INTRO_NAME} - Run an army of coding agents`,
			description,
			images: ["/og-image.png"],
			creator: SOCIAL.X.handle,
		},
		robots: {
			index: true,
			follow: true,
			googleBot: {
				index: true,
				follow: true,
				"max-video-preview": -1,
				"max-image-preview": "large",
				"max-snippet": -1,
			},
		},
		icons: {
			icon: [
				{ url: "/favicon.ico", sizes: "32x32" },
				{ url: "/favicon-192.png", sizes: "192x192", type: "image/png" },
			],
			apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
		},
		manifest: "/manifest.json",
	};
}

async function currentYear(): Promise<number> {
	"use cache";
	cacheLife("days");
	return new Date().getFullYear();
}

export function generateStaticParams() {
	return [{ lang: DEFAULT_LOCALE }];
}

export default async function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	const locale = await initServerI18n();
	const messages = await getLocaleMessages(locale);

	return (
		<html
			lang={locale}
			style={{ colorScheme: "dark" }}
			className={`dark overscroll-none ${geistMono.variable} ${geist.variable}`}
			suppressHydrationWarning
		>
			<head>
				<meta name="darkreader-lock" />
				<OrganizationJsonLd />
				<SoftwareApplicationJsonLd
					dateModified={getChangelogEntries()[0]?.date}
				/>
				<WebsiteJsonLd />
				{/* Google tag (gtag.js) for Google Ads */}
				<Script
					src="https://www.googletagmanager.com/gtag/js?id=AW-18209336001"
					strategy="lazyOnload"
				/>
				<Script id="google-ads-gtag" strategy="lazyOnload">
					{`
						window.dataLayer = window.dataLayer || [];
						function gtag(){dataLayer.push(arguments);}
						gtag('js', new Date());
						gtag('config', 'AW-18209336001');
					`}
				</Script>
				{/* Reddit Pixel */}
				<Script id="reddit-pixel" strategy="lazyOnload">
					{`
						!function(w,d){if(!w.rdt){var p=w.rdt=function(){p.sendEvent?p.sendEvent.apply(p,arguments):p.callQueue.push(arguments)};p.callQueue=[];var t=d.createElement("script");t.src="https://www.redditstatic.com/ads/pixel.js?pixel_id=${REDDIT_PIXEL_ID}",t.async=!0;var s=d.getElementsByTagName("script")[0];s.parentNode.insertBefore(t,s)}}(window,document);
						rdt('init','${REDDIT_PIXEL_ID}');
						rdt('track','PageVisit');
					`}
				</Script>
			</head>
			<body className="overscroll-none font-sans">
				<Providers locale={locale} messages={messages}>
					<Header
						ctaButtons={
							<Suspense fallback={null}>
								<CTAButtons />
							</Suspense>
						}
						starCounter={<GitHubStarCounter />}
					/>
					{children}
					<Suspense fallback={null}>
						<Footer locale={locale} year={await currentYear()} />
					</Suspense>
					<CookieConsent />
				</Providers>
				<Suspense fallback={null}>
					<ExternalTracking />
				</Suspense>
			</body>
		</html>
	);
}
