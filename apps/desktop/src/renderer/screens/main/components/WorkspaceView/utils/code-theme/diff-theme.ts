import { type DiffsTheme, registerCustomTheme } from "@pierre/diffs";
import type { DiffsThemeNames } from "@pierre/diffs/react";
import type { Theme as ZedTheme } from "@pierre/highlights";
import { type EditorTheme, getEditorTheme, type Theme } from "shared/themes";
import { toHex, toHexAuto } from "shared/themes/utils";

const REGISTERED_DIFF_THEMES = new Set<string>();

type SyntaxRole = keyof EditorTheme["syntax"];

interface RoleStyle {
	role: SyntaxRole;
	italic?: boolean;
	bold?: boolean;
	underline?: boolean;
}

interface RoleMapping extends RoleStyle {
	textmate: string[];
	zed: string[];
}

/**
 * One table drives both backends, so Shiki (TextMate scopes) and Highlights
 * (Zed token names) color the same code the same way.
 */
const ROLE_MAPPINGS: RoleMapping[] = [
	{
		role: "comment",
		italic: true,
		textmate: ["comment", "punctuation.definition.comment"],
		zed: ["comment", "comment.doc"],
	},
	{
		role: "keyword",
		textmate: ["keyword", "storage", "storage.modifier"],
		zed: [
			"keyword",
			"keyword.control",
			"keyword.declaration",
			"keyword.import",
			"preproc",
		],
	},
	{
		role: "operator",
		textmate: ["keyword.operator"],
		zed: ["operator", "keyword.operator"],
	},
	{
		role: "string",
		textmate: ["string", "string.template"],
		zed: ["string", "string.special", "string.special.symbol", "text.literal"],
	},
	{
		role: "number",
		textmate: ["constant.numeric", "number", "constant.language"],
		zed: ["number", "boolean"],
	},
	{
		role: "functionCall",
		textmate: [
			"entity.name.function",
			"support.function",
			"meta.function-call",
		],
		zed: ["function", "function.definition", "function.method"],
	},
	{
		role: "variableName",
		textmate: ["variable", "meta.definition.variable", "identifier"],
		zed: ["variable", "variable.special"],
	},
	{
		role: "property",
		textmate: [
			"variable.other.property",
			"variable.other.object.property",
			"support.variable.property",
			"meta.object-literal.key",
		],
		zed: ["property", "property.json_key"],
	},
	{
		role: "parameter",
		textmate: ["variable.parameter"],
		zed: ["variable.parameter"],
	},
	{
		role: "typeName",
		textmate: ["entity.name.type", "support.type", "storage.type"],
		zed: ["type", "type.builtin", "enum", "variant"],
	},
	{
		role: "className",
		textmate: ["entity.name.class", "entity.other.inherited-class"],
		zed: ["type.class", "constructor", "namespace"],
	},
	{
		role: "constant",
		textmate: ["constant", "support.constant"],
		zed: ["constant", "constant.builtin", "label"],
	},
	{
		role: "regexp",
		textmate: ["string.regexp", "constant.other.character-class.regexp"],
		zed: ["string.regex", "string.escape"],
	},
	{
		role: "tagName",
		textmate: [
			"entity.name.tag",
			"punctuation.definition.tag",
			"support.class.component",
		],
		zed: [
			"tag",
			"tag.doctype",
			"tag.jsx",
			"tag.component.jsx",
			"punctuation.bracket.html",
			"punctuation.bracket.jsx",
		],
	},
	{
		role: "attributeName",
		textmate: ["entity.other.attribute-name"],
		zed: ["attribute", "attribute.jsx", "selector", "selector.class"],
	},
	{
		role: "punctuation",
		textmate: [
			"punctuation.separator",
			"punctuation.terminator",
			"punctuation.accessor",
			"meta.brace",
		],
		zed: ["punctuation", "punctuation.bracket", "punctuation.delimiter"],
	},
	{
		role: "heading",
		bold: true,
		textmate: ["markup.heading", "entity.name.section"],
		zed: ["title"],
	},
	{
		role: "link",
		underline: true,
		textmate: ["markup.underline.link", "string.other.link"],
		zed: ["link_uri", "link_text"],
	},
	{
		role: "invalid",
		textmate: ["invalid", "invalid.illegal"],
		zed: [],
	},
];

const MARKUP_STYLES: { textmate: string; zed: string; style: string }[] = [
	{ textmate: "markup.bold", zed: "emphasis.strong", style: "bold" },
	{ textmate: "markup.italic", zed: "emphasis", style: "italic" },
];

function hashString(value: string): string {
	let hash = 0;

	for (let index = 0; index < value.length; index += 1) {
		hash = (hash << 5) - hash + value.charCodeAt(index);
		hash |= 0;
	}

	return Math.abs(hash).toString(36);
}

function createDiffThemeName(theme: Theme): DiffsThemeNames {
	const signature = hashString(JSON.stringify(getEditorTheme(theme)));
	return `superset-diff-${theme.id}-${signature}` as DiffsThemeNames;
}

function textMateFontStyle({ italic, bold, underline }: RoleStyle) {
	const styles = [
		italic && "italic",
		bold && "bold",
		underline && "underline",
	].filter(Boolean);
	return styles.length > 0 ? styles.join(" ") : undefined;
}

function createTextMateTheme(
	name: string,
	theme: Theme,
	editorTheme: EditorTheme,
) {
	return {
		name,
		type: theme.type,
		colors: {
			"editor.background": toHex(editorTheme.colors.background),
			"editor.foreground": toHex(editorTheme.colors.foreground),
			"editorLineNumber.foreground": toHex(editorTheme.colors.gutterForeground),
			"editorLineNumber.activeForeground": toHex(editorTheme.colors.foreground),
			"editor.selectionBackground": toHexAuto(editorTheme.colors.selection),
			"editor.lineHighlightBackground": toHexAuto(
				editorTheme.colors.activeLine,
			),
		},
		tokenColors: [
			{
				settings: {
					foreground: toHex(editorTheme.syntax.plainText),
					background: toHex(editorTheme.colors.background),
				},
			},
			...ROLE_MAPPINGS.map((mapping) => ({
				scope: mapping.textmate,
				settings: {
					foreground: toHex(editorTheme.syntax[mapping.role]),
					fontStyle: textMateFontStyle(mapping),
				},
			})),
			...MARKUP_STYLES.map(({ textmate, style }) => ({
				scope: [textmate],
				settings: { fontStyle: style },
			})),
		],
	};
}

/** Zed theme for the Highlights backend and the editor's live tokenizer. */
export function createZedTheme(theme: Theme): ZedTheme {
	const editorTheme = getEditorTheme(theme);
	const syntax: NonNullable<ZedTheme["style"]["syntax"]> = {};
	for (const mapping of ROLE_MAPPINGS) {
		for (const token of mapping.zed) {
			syntax[token] = {
				color: toHexAuto(editorTheme.syntax[mapping.role]),
				font_style: mapping.italic ? "italic" : undefined,
				font_weight: mapping.bold ? 700 : undefined,
			};
		}
	}
	for (const { zed, style } of MARKUP_STYLES) {
		syntax[zed] =
			style === "bold" ? { font_weight: 700 } : { font_style: "italic" };
	}

	return {
		name: createDiffThemeName(theme),
		appearance: theme.type,
		style: {
			"editor.background": toHex(editorTheme.colors.background),
			"editor.foreground": toHex(editorTheme.syntax.plainText),
			"editor.active_line.background": toHexAuto(editorTheme.colors.activeLine),
			syntax,
		},
	};
}

function createDiffsTheme(theme: Theme): DiffsTheme {
	const editorTheme = getEditorTheme(theme);
	const name = createDiffThemeName(theme);
	return {
		name,
		type: theme.type,
		fg: toHex(editorTheme.syntax.plainText),
		bg: toHex(editorTheme.colors.background),
		// Pierre normalizes this to a resolved Shiki theme when it loads.
		textmate: createTextMateTheme(
			name,
			theme,
			editorTheme,
		) as unknown as DiffsTheme["textmate"],
		zed: createZedTheme(theme),
	};
}

export function getDiffsTheme(theme: Theme): DiffsThemeNames {
	const themeName = createDiffThemeName(theme);

	if (!REGISTERED_DIFF_THEMES.has(themeName)) {
		registerCustomTheme(
			themeName,
			async () => createDiffsTheme(theme),
			"diffs",
		);
		REGISTERED_DIFF_THEMES.add(themeName);
	}

	return themeName;
}
