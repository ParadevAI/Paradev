import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { usageWidgetDevelopmentCsp } from "./usage-widget-csp";

const preamble =
	'import { injectIntoGlobalHook } from "/@react-refresh";\ninjectIntoGlobalHook(window);';
const html = `<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'"/><script type="module">${preamble}</script></head><body><script type="module" src="/usage-widget/index.tsx"></script></body></html>`;
const context = {
	filename: "/src/renderer/usage-widget.html",
	serverUrls: ["http://localhost:5173/"],
};

describe("usage widget development CSP", () => {
	test("hashes the actual inline preamble and admits only the exact development socket", () => {
		const result = usageWidgetDevelopmentCsp(html, context);
		const hash = createHash("sha256").update(preamble).digest("base64");
		expect(result).toContain(`script-src 'self' 'sha256-${hash}'`);
		expect(result).toContain("connect-src 'self' ws://localhost:5173");
		expect(result).not.toContain("script-src 'self' 'unsafe-inline'");
		expect(result).not.toContain("'unsafe-eval'");
		expect(result).toContain("default-src 'self'");
		expect(result).toContain("style-src 'self' 'unsafe-inline'");
	});

	test("leaves packaged HTML and every other renderer unchanged", () => {
		expect(usageWidgetDevelopmentCsp(html)).toBe(html);
		expect(
			usageWidgetDevelopmentCsp(html, {
				...context,
				filename: "/src/renderer/index.html",
			}),
		).toBe(html);
	});

	test("honors a configured secure HMR endpoint without admitting other hosts", () => {
		const result = usageWidgetDevelopmentCsp(html, {
			...context,
			hmr: { protocol: "wss", host: "localhost", clientPort: 8443 },
		});
		expect(result).toContain("connect-src 'self' wss://localhost:8443");
		expect(result).not.toContain("ws://localhost:5173");
		expect(result).not.toContain("https:");
	});

	test("does not allow malformed endpoints or add sockets when HMR is disabled", () => {
		for (const extra of [
			{ serverUrls: ["https://user:secret@localhost:5173/"] },
			{ hmr: { host: "evil.invalid 'unsafe-inline'" } },
			{ hmr: { port: 0 } },
			{ hmr: false as const },
		]) {
			const result = usageWidgetDevelopmentCsp(html, { ...context, ...extra });
			expect(result).toContain("connect-src 'self'");
			expect(result).not.toMatch(/wss?:\/\//);
		}
	});
});
