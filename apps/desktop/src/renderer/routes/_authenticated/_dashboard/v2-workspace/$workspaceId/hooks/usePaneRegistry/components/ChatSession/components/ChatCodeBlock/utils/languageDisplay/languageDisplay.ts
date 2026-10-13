const PLAIN_TEXT = new Set(["text", "txt", "plaintext", "plain"]);

const LANGUAGES: Record<string, [label: string, extension: string]> = {
	bash: ["Shell", "sh"],
	c: ["C", "c"],
	"c#": ["C#", "cs"],
	"c++": ["C++", "cpp"],
	console: ["Shell", "sh"],
	cpp: ["C++", "cpp"],
	cs: ["C#", "cs"],
	csharp: ["C#", "cs"],
	css: ["CSS", "css"],
	diff: ["Diff", "diff"],
	dockerfile: ["Dockerfile", "dockerfile"],
	go: ["Go", "go"],
	graphql: ["GraphQL", "graphql"],
	html: ["HTML", "html"],
	java: ["Java", "java"],
	javascript: ["JavaScript", "js"],
	js: ["JavaScript", "js"],
	json: ["JSON", "json"],
	jsonc: ["JSON", "json"],
	jsx: ["JSX", "jsx"],
	kotlin: ["Kotlin", "kt"],
	kt: ["Kotlin", "kt"],
	makefile: ["Makefile", "makefile"],
	markdown: ["Markdown", "md"],
	md: ["Markdown", "md"],
	patch: ["Diff", "diff"],
	php: ["PHP", "php"],
	py: ["Python", "py"],
	python: ["Python", "py"],
	rb: ["Ruby", "rb"],
	rs: ["Rust", "rs"],
	ruby: ["Ruby", "rb"],
	rust: ["Rust", "rs"],
	scss: ["SCSS", "scss"],
	sh: ["Shell", "sh"],
	shell: ["Shell", "sh"],
	sql: ["SQL", "sql"],
	swift: ["Swift", "swift"],
	toml: ["TOML", "toml"],
	ts: ["TypeScript", "ts"],
	tsx: ["TSX", "tsx"],
	typescript: ["TypeScript", "ts"],
	xml: ["XML", "xml"],
	yaml: ["YAML", "yaml"],
	yml: ["YAML", "yaml"],
	zsh: ["Shell", "sh"],
};

export type LanguageDisplay = {
	/** Null for plain text, which the caller names in the reader's language. */
	label: string | null;
	/** A file name the icon set knows, or null for the generic code icon. */
	iconFileName: string | null;
};

export function languageDisplay(language: string | null): LanguageDisplay {
	if (language === null || PLAIN_TEXT.has(language)) {
		return { label: null, iconFileName: null };
	}
	const known = LANGUAGES[language];
	if (known) return { label: known[0], iconFileName: `code.${known[1]}` };
	return {
		label: language,
		iconFileName: /^[a-z0-9]+$/.test(language) ? `code.${language}` : null,
	};
}
