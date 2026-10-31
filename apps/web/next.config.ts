import { join } from "node:path";
import { withSentryConfig } from "@sentry/nextjs";
import { withOwnDomainTwins } from "@superset/shared/own-domains";
import { config as dotenvConfig } from "dotenv";
import type { NextConfig } from "next";

// Load .env from monorepo root during development
if (process.env.NODE_ENV !== "production") {
	dotenvConfig({
		path: join(process.cwd(), "../../.env"),
		override: true,
		quiet: true,
	});
}

const isProduction = process.env.NODE_ENV === "production";
const apiOrigin = process.env.NEXT_PUBLIC_API_URL
	? new URL(process.env.NEXT_PUBLIC_API_URL).origin
	: null;
// Each origin as both its http(s) and ws(s) form: an http host source does not
// admit a WebSocket to the same host. The prod fallbacks keep the header
// correct when a URL isn't plumbed into the build env.
const httpAndWsOrigins = (url: string | undefined, prodFallback: string) => {
	const origin = url ? new URL(url).origin : isProduction ? prodFallback : null;
	return origin ? [origin, origin.replace(/^http/, "ws")] : [];
};
// Published pages are framed from their own origin, one subdomain per page.
// An unset GitHub Actions var arrives as an empty string, which `??`
// does not catch — and `new URL("")` throws before Next even loads.
const usercontentUrl = new URL(
	process.env.USERCONTENT_URL ||
		(isProduction
			? "https://frame.supersetusercontent.com"
			: "http://frame.usercontent.localhost:8787"),
);
const usercontentFrameSource = `${usercontentUrl.protocol}//*.${usercontentUrl.host}`;
const serviceConnectSources = withOwnDomainTwins([
	apiOrigin,
	...httpAndWsOrigins(process.env.RELAY_URL, "https://relay.superset.sh"),
	...httpAndWsOrigins(
		process.env.RELAY_BACKUP_URL,
		"https://relay-backup.superset.sh",
	),
	...httpAndWsOrigins(
		process.env.NEXT_PUBLIC_REALTIME_URL,
		"https://realtime.superset.sh",
	),
]);
const attachmentUploadSource = process.env.R2_ENDPOINT
	? new URL(process.env.R2_ENDPOINT).origin
	: "https://*.r2.cloudflarestorage.com";

const contentSecurityPolicy = [
	"default-src 'self'",
	"base-uri 'self'",
	[
		"connect-src 'self'",
		...serviceConnectSources,
		"https://*.ingest.sentry.io",
		"https://*.sentry.io",
		"https://us.i.posthog.com",
		"https://us-assets.i.posthog.com",
		"https://us.posthog.com",
		"https://cloudflareinsights.com",
		!isProduction && "ws:",
		!isProduction && "wss:",
	]
		.filter(Boolean)
		.join(" "),
	"font-src 'self' data: https://fonts.gstatic.com",
	"form-action 'self'",
	"frame-ancestors 'none'",
	`frame-src ${usercontentFrameSource}`,
	"img-src 'self' data: blob: https:",
	"object-src 'none'",
	[
		// wasm-unsafe-eval: WebAssembly.instantiate only — NOT eval()/Function.
		// Without it Chrome blocks wasm under script-src (WEB-2K, /oauth/consent).
		"script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
		"https://static.cloudflareinsights.com",
		!isProduction && "'unsafe-eval'",
	]
		.filter(Boolean)
		.join(" "),
	"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
	"worker-src 'self' blob:",
].join("; ");

const agentsContentSecurityPolicy = [
	"default-src 'self'",
	"base-uri 'self'",
	[
		"connect-src 'self'",
		...serviceConnectSources,
		attachmentUploadSource,
		"https://*.ingest.sentry.io",
		"https://*.sentry.io",
		!isProduction && "ws:",
		!isProduction && "wss:",
	]
		.filter(Boolean)
		.join(" "),
	"font-src 'self' data:",
	"form-action 'self'",
	"frame-ancestors 'none'",
	`frame-src ${usercontentFrameSource}`,
	"img-src 'self' data: blob: https:",
	"media-src 'self' blob:",
	"object-src 'none'",
	["script-src 'self' 'unsafe-inline'", !isProduction && "'unsafe-eval'"]
		.filter(Boolean)
		.join(" "),
	"style-src 'self' 'unsafe-inline'",
	"worker-src 'self' blob:",
].join("; ");

const agentsHeaders = [
	{ key: "Content-Security-Policy", value: agentsContentSecurityPolicy },
	{
		key: "Permissions-Policy",
		value: "camera=(), geolocation=(), microphone=(self)",
	},
];

const securityHeaders: Array<{ key: string; value: string }> = [
	...(isProduction
		? [
				{
					key: "Strict-Transport-Security",
					value: "max-age=31536000; includeSubDomains",
				},
			]
		: []),
	{
		key: "Content-Security-Policy",
		value: contentSecurityPolicy,
	},
	{
		key: "Permissions-Policy",
		value: "camera=(), geolocation=(), microphone=()",
	},
	{
		key: "Referrer-Policy",
		value: "strict-origin-when-cross-origin",
	},
	{
		key: "X-Content-Type-Options",
		value: "nosniff",
	},
	{
		key: "X-Frame-Options",
		value: "DENY",
	},
];

const config: NextConfig = {
	reactCompiler: true,
	typescript: { ignoreBuildErrors: true },

	// Compiles @lingui/react/macro at build time. Version must stay in
	// lockstep with Next's swc_core ABI — see plans/20260826-i18n-strategy.md.
	experimental: {
		swcPlugins: [["@lingui/swc-plugin", {}]],
	},

	async rewrites() {
		return [
			{
				source: "/ingest/static/:path*",
				destination: "https://us-assets.i.posthog.com/static/:path*",
			},
			{
				source: "/ingest/:path*",
				destination: "https://us.i.posthog.com/:path*",
			},
			{
				source: "/ingest/decide",
				destination: "https://us.i.posthog.com/decide",
			},
			...(process.env.AGENTS_URL
				? ["/agents", "/agents/:path*"].map((source) => ({
						source,
						destination: `${process.env.AGENTS_URL}${source}`,
					}))
				: []),
		];
	},

	async headers() {
		return [
			{
				source: "/(.*)",
				headers: securityHeaders,
			},
			{ source: "/agents", headers: agentsHeaders },
			{ source: "/agents/:path*", headers: agentsHeaders },
		];
	},

	skipTrailingSlashRedirect: true,
};

export default withSentryConfig(config, {
	org: "superset-sh",
	project: "web",
	applicationKey: "superset-web",
	silent: !process.env.CI,
	authToken: process.env.SENTRY_AUTH_TOKEN,
	widenClientFileUpload: true,
	tunnelRoute: "/monitoring",
	disableLogger: true,
	automaticVercelMonitors: true,
});
