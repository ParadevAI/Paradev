import { createHash } from "node:crypto";

interface DevelopmentContext {
	filename: string;
	serverUrls: readonly string[];
	hmr?:
		| boolean
		| {
				host?: string;
				protocol?: string;
				port?: number;
				clientPort?: number;
		  };
}

function connectSources(context: DevelopmentContext): string[] {
	const sources = new Set(["'self'"]);
	if (context.hmr === false) return [...sources];
	for (const source of context.serverUrls) {
		try {
			const url = new URL(source);
			if (
				!["http:", "https:"].includes(url.protocol) ||
				url.username ||
				url.password
			)
				continue;
			const hmr = typeof context.hmr === "object" ? context.hmr : undefined;
			const protocol =
				hmr?.protocol ?? (url.protocol === "https:" ? "wss" : "ws");
			if (protocol !== "ws" && protocol !== "wss") continue;
			let host = hmr?.host ?? url.hostname;
			if (!/^[a-zA-Z0-9.:[\]-]+$/.test(host)) continue;
			if (host.includes(":") && !host.startsWith("[")) host = `[${host}]`;
			const port =
				hmr?.clientPort ??
				hmr?.port ??
				(url.port ? Number(url.port) : undefined);
			if (
				port !== undefined &&
				(!Number.isInteger(port) || port < 1 || port > 65535)
			)
				continue;
			const endpoint = new URL(
				`${protocol}://${host}${port === undefined ? "" : `:${port}`}`,
			);
			sources.add(endpoint.origin);
		} catch {}
	}
	return [...sources];
}

export function usageWidgetDevelopmentCsp(
	html: string,
	context?: DevelopmentContext,
): string {
	if (
		!context ||
		context.filename.replaceAll("\\", "/").split("/").at(-1) !==
			"usage-widget.html"
	)
		return html;
	const hashes = new Set<string>();
	for (const match of html.matchAll(
		/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi,
	)) {
		if (/\bsrc\s*=/i.test(match[1] ?? "") || !match[2]?.trim()) continue;
		const code = match[2].replace(/\r\n?/g, "\n");
		hashes.add(
			`'sha256-${createHash("sha256").update(code).digest("base64")}'`,
		);
	}
	return html.replace(/<meta\b[^>]*>/gi, (tag) => {
		if (!/\bhttp-equiv\s*=\s*(["'])Content-Security-Policy\1/i.test(tag))
			return tag;
		return tag.replace(
			/\bcontent\s*=\s*(["])([\s\S]*?)\1/i,
			(_match, quote: string, policy: string) => {
				const directives = policy
					.split(";")
					.map((entry) => entry.trim().split(/\s+/));
				for (const directive of directives) {
					if (directive[0] === "script-src") directive.push(...hashes);
					if (directive[0] === "connect-src")
						directive.splice(
							1,
							directive.length - 1,
							...connectSources(context),
						);
				}
				return `content=${quote}${directives
					.filter((entry) => entry[0])
					.map((entry) => entry.join(" "))
					.join("; ")}${quote}`;
			},
		);
	});
}
