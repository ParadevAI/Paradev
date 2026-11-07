import { describe, expect, it } from "bun:test";
import { renderAuthCallbackPage } from "./auth-callback-page";

describe("renderAuthCallbackPage", () => {
	it("escapes translated text so it cannot inject markup", () => {
		const html = renderAuthCallbackPage({
			appName: "Superset",
			title: "<script>alert(1)</script>",
			description: `Tom & "Jerry's" <b>app</b>`,
		});

		expect(html).not.toContain("<script>alert(1)</script>");
		expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
		expect(html).toContain(
			"Tom &amp; &quot;Jerry&#39;s&quot; &lt;b&gt;app&lt;/b&gt;",
		);
	});
});
