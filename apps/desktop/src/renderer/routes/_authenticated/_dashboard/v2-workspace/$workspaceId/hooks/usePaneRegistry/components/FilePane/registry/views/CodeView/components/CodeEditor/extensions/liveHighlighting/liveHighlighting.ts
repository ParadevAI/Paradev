import { RangeSetBuilder, StateEffect, type Text } from "@codemirror/state";
import {
	Decoration,
	type DecorationSet,
	type EditorView,
	ViewPlugin,
	type ViewUpdate,
} from "@codemirror/view";
import { canUseWASM, getFiletypeFromFileName } from "@pierre/diffs";
import type {
	LiveTextEdit,
	LiveTokenizer,
	Theme as ZedTheme,
} from "@pierre/highlights";

const TOKENIZE_MAX_LINE_LENGTH = 5_000;
const FONT_STYLE_ITALIC = 1;
const FONT_STYLE_BOLD = 2;
const FONT_STYLE_UNDERLINE = 4;

type HighlightsModule = typeof import("@pierre/highlights");
type LiveHighlighting = { module: HighlightsModule; lang: string };

const refreshTokens = StateEffect.define<null>();

let loadedModule: HighlightsModule | undefined;
let moduleFailed = false;
const moduleLoad = canUseWASM()
	? import("@pierre/highlights").then(
			(module) => {
				loadedModule = module;
			},
			(error) => {
				moduleFailed = true;
				console.error("[CodeEditor] Failed to load live highlighting:", error);
			},
		)
	: undefined;

/**
 * The language the diff view would pick for this path, when the Highlights
 * lexers cover it. Null means the editor keeps its Lezer highlight style;
 * undefined means the lexers are still loading.
 */
export function resolveLiveHighlighting(
	filePath: string,
): LiveHighlighting | null | undefined {
	if (!moduleLoad || moduleFailed) return null;
	if (!loadedModule) return undefined;
	const lang = getFiletypeFromFileName(filePath);
	if (lang === "text" || !loadedModule.isSupportedLanguage(lang)) return null;
	return { module: loadedModule, lang };
}

export async function loadLiveHighlighting(
	filePath: string,
): Promise<LiveHighlighting | null> {
	await moduleLoad;
	return resolveLiveHighlighting(filePath) ?? null;
}

function toPosition(doc: Text, offset: number) {
	const line = doc.lineAt(offset);
	return { line: line.number - 1, character: offset - line.from };
}

function tokenStyle(color: string | undefined, fontStyle = 0) {
	const parts: string[] = [];
	if (color) parts.push(`color:${color}`);
	if (fontStyle & FONT_STYLE_ITALIC) parts.push("font-style:italic");
	if (fontStyle & FONT_STYLE_BOLD) parts.push("font-weight:700");
	if (fontStyle & FONT_STYLE_UNDERLINE) parts.push("text-decoration:underline");
	return parts.join(";");
}

/**
 * Colors the document with the same lexers and theme as the diff view.
 * Only visible lines are tokenized synchronously; the rest arrive in the
 * background and trigger a redraw.
 */
export function liveHighlighting(
	{ module, lang }: LiveHighlighting,
	theme: ZedTheme,
) {
	return ViewPlugin.define(
		(view) => new LiveHighlightingPlugin(view, module, lang, theme),
		{ decorations: (plugin) => plugin.decorations },
	);
}

class LiveHighlightingPlugin {
	decorations: DecorationSet = Decoration.none;
	private readonly tokenizer: LiveTokenizer;
	private readonly marks = new Map<string, Decoration>();
	private refreshFrame: number | null = null;
	private readonly foreground: string | undefined;

	constructor(
		private readonly view: EditorView,
		module: HighlightsModule,
		lang: string,
		theme: ZedTheme,
	) {
		this.foreground = theme.style["editor.foreground"]?.toLowerCase();
		this.tokenizer = new module.LiveTokenizer({
			lang: lang as never,
			theme,
			code: view.state.doc.toString(),
			tokenizeMaxLineLength: TOKENIZE_MAX_LINE_LENGTH,
			renderRange: this.renderRange(view),
			onDeferTokenize: () => this.scheduleRefresh(),
		});
		this.decorations = this.build(view);
	}

	update(update: ViewUpdate) {
		if (update.docChanged) {
			const edits: LiveTextEdit[] = [];
			update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
				edits.push({
					range: {
						start: toPosition(update.startState.doc, fromA),
						end: toPosition(update.startState.doc, toA),
					},
					newText: inserted.toString(),
				});
			});
			this.tokenizer.applyEdits(edits, {
				renderRange: this.renderRange(update.view),
			});
		}
		const refreshed = update.transactions.some((transaction) =>
			transaction.effects.some((effect) => effect.is(refreshTokens)),
		);
		if (update.docChanged || update.viewportChanged || refreshed) {
			this.decorations = this.build(update.view);
		}
	}

	destroy() {
		if (this.refreshFrame !== null) cancelAnimationFrame(this.refreshFrame);
		this.tokenizer.dispose();
	}

	private renderRange(view: EditorView): [number, number] {
		const { doc } = view.state;
		const first = doc.lineAt(view.viewport.from).number - 1;
		const last = doc.lineAt(view.viewport.to).number;
		return [first, last];
	}

	private scheduleRefresh() {
		if (this.refreshFrame !== null) return;
		this.refreshFrame = requestAnimationFrame(() => {
			this.refreshFrame = null;
			this.view.dispatch({ effects: refreshTokens.of(null) });
		});
	}

	private mark(style: string) {
		let decoration = this.marks.get(style);
		if (!decoration) {
			decoration = Decoration.mark({ attributes: { style } });
			this.marks.set(style, decoration);
		}
		return decoration;
	}

	private build(view: EditorView): DecorationSet {
		// The constructor's first deferred batch can land before the field is set.
		if (!this.tokenizer) return Decoration.none;
		const builder = new RangeSetBuilder<Decoration>();
		const { doc } = view.state;
		const [first, last] = this.renderRange(view);
		for (let index = first; index < last; index += 1) {
			const line = doc.line(index + 1);
			for (const token of this.tokenizer.getLineTokens(index).tokens) {
				if (token.content.length === 0) continue;
				const color =
					token.color?.toLowerCase() === this.foreground
						? undefined
						: token.color;
				const style = tokenStyle(color, token.fontStyle);
				if (!style) continue;
				const from = line.from + token.offset;
				builder.add(from, from + token.content.length, this.mark(style));
			}
		}
		return builder.finish();
	}
}
