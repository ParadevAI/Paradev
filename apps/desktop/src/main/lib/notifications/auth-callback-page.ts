const HTML_ESCAPES: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};

function escapeHtml(text: string): string {
	return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

export function renderAuthCallbackPage({
	appName,
	title,
	description,
}: {
	appName: string;
	title: string;
	description: string;
}): string {
	return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(appName)}</title>
<style>
:root{color-scheme:light dark;--bg:#fff;--fg:#151110;--muted:#5f5b59}
@media (prefers-color-scheme:dark){:root{--bg:#151110;--fg:#eae8e6;--muted:#a8a5a3}}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:0 16px 12vh;box-sizing:border-box;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,-apple-system,sans-serif}
main{max-width:320px;text-align:center}
.name{font-weight:600;letter-spacing:.08em;text-transform:uppercase;font-size:13px;color:var(--muted)}
h1{margin:20px 0 4px;font-size:18px;font-weight:500}
p{margin:0;color:var(--muted);text-wrap:balance}
</style></head>
<body><main><div class="name">${escapeHtml(appName)}</div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></main></body></html>`;
}
