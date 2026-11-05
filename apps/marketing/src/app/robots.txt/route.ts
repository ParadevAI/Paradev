import { COMPANY } from "@superset/shared/constants";

const WELCOME_AI_AGENTS = [
	"GPTBot",
	"ChatGPT-User",
	"OAI-SearchBot",
	"ClaudeBot",
	"Claude-User",
	"Claude-SearchBot",
	"anthropic-ai",
	"PerplexityBot",
	"Perplexity-User",
	"Google-Extended",
	"GoogleOther",
	"Applebot-Extended",
	"DuckAssistBot",
	"Meta-ExternalAgent",
	"ora-agent",
	"CCBot",
	"Bytespider",
];

export function GET() {
	const baseUrl = COMPANY.MARKETING_URL;

	const content = `# Default: open to all crawlers
User-Agent: *
Allow: /

# AI assistants, AI search, and AI training crawlers: explicitly welcome
${WELCOME_AI_AGENTS.map((agent) => `User-Agent: ${agent}\nAllow: /`).join("\n\n")}

# Content Signals (https://contentsignals.org)
Content-Signal: search=yes, ai-input=yes, ai-train=yes

Sitemap: ${baseUrl}/sitemap.xml
`;

	return new Response(content, {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, max-age=3600, s-maxage=3600",
			// Discovery links are HTTP metadata, not robots.txt directives.
			// Google reports custom Agentmap/schemamap lines as syntax errors.
			Link: [
				`<${baseUrl}/.well-known/ai-catalog.json>; rel="describedby"; type="application/json"`,
				`<${baseUrl}/schemamap.xml>; rel="describedby"; type="application/xml"`,
			].join(", "),
		},
	});
}
