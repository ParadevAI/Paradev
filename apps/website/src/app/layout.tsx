import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
	title: "Superset",
	description: "Superset Website",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html
			lang="en"
			className={`overscroll-none ${GeistSans.variable} ${GeistMono.variable}`}
		>
			<head>
				<Script
					src="https://tally.so/widgets/embed.js"
					strategy="afterInteractive"
				/>
			</head>
			<body className="overscroll-none font-sans">{children}</body>
		</html>
	);
}
