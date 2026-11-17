import {
	defaultKeymap,
	history,
	historyKeymap,
	indentWithTab,
} from "@codemirror/commands";
import {
	bracketMatching,
	codeFolding,
	foldGutter,
	foldKeymap,
	indentOnInput,
} from "@codemirror/language";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
	drawSelection,
	dropCursor,
	EditorView,
	highlightActiveLine,
	highlightActiveLineGutter,
	highlightSpecialChars,
	keymap,
	lineNumbers,
} from "@codemirror/view";
import { colorPicker } from "@replit/codemirror-css-color-picker";
import { cn } from "@superset/ui/utils";
import { useQuery } from "@tanstack/react-query";
import { type MutableRefObject, useEffect, useRef } from "react";
import { FONT_SETTINGS_QUERY_KEY } from "renderer/lib/font-settings";
import { replaceEditorDocument } from "renderer/lib/replaceEditorDocument";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { createZedTheme } from "renderer/screens/main/components/WorkspaceView/utils/code-theme";
import { useResolvedTheme } from "renderer/stores/theme";
import type { Theme } from "shared/themes";
import {
	type CodeEditorAdapter,
	createCodeMirrorAdapter,
} from "./CodeEditorAdapter";
import { createCodeMirrorTheme } from "./createCodeMirrorTheme";
import { contourSelectionLayer } from "./extensions/contourSelectionLayer";
import { buildFoldChevron } from "./extensions/foldChevron";
import { buildFoldPlaceholder } from "./extensions/foldPlaceholder";
import {
	liveHighlighting,
	loadLiveHighlighting,
	resolveLiveHighlighting,
} from "./extensions/liveHighlighting";
import { selectionClassTogglePlugin } from "./extensions/selectionClassTogglePlugin";
import { loadLanguageSupport } from "./loadLanguageSupport";
import { getCodeSyntaxHighlighting } from "./syntax-highlighting";

/** Undefined while the live lexers are still loading. */
function highlightingFor(
	filePath: string | undefined,
	theme: Theme,
): Extension | undefined {
	const live = filePath ? resolveLiveHighlighting(filePath) : null;
	if (live === undefined) return undefined;
	return live
		? liveHighlighting(live, createZedTheme(theme))
		: getCodeSyntaxHighlighting(theme);
}

interface CodeEditorProps {
	value: string;
	language: string;
	filePath?: string;
	readOnly?: boolean;
	fillHeight?: boolean;
	className?: string;
	editorRef?: MutableRefObject<CodeEditorAdapter | null>;
	onChange?: (value: string) => void;
	onSave?: () => void;
	initialScrollPosition?: { scrollTop: number; scrollLeft: number };
	onScrollPositionChange?: (position: {
		scrollTop: number;
		scrollLeft: number;
	}) => void;
}

export function CodeEditor({
	value,
	language,
	filePath,
	readOnly = false,
	fillHeight = true,
	className,
	editorRef,
	onChange,
	onSave,
	initialScrollPosition,
	onScrollPositionChange,
}: CodeEditorProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const viewRef = useRef<EditorView | null>(null);
	const languageCompartment = useRef(new Compartment()).current;
	const themeCompartment = useRef(new Compartment()).current;
	const highlightCompartment = useRef(new Compartment()).current;
	const appliedHighlightingRef = useRef<{
		filePath: string | undefined;
		theme: Theme;
	} | null>(null);
	const editableCompartment = useRef(new Compartment()).current;
	const onChangeRef = useRef(onChange);
	const onSaveRef = useRef(onSave);
	const onScrollPositionChangeRef = useRef(onScrollPositionChange);
	const initialScrollPositionRef = useRef(initialScrollPosition);
	// Guards against re-entrant onChange calls triggered by the value-sync effect's own dispatch.
	const isExternalUpdateRef = useRef(false);
	const { data: fontSettings } = useQuery({
		queryKey: FONT_SETTINGS_QUERY_KEY,
		queryFn: () => electronTrpcClient.settings.getFontSettings.query(),
		staleTime: 30_000,
	});
	const editorFontFamily = fontSettings?.editorFontFamily ?? undefined;
	const editorFontSize = fontSettings?.editorFontSize ?? undefined;
	const editorLineHeight = fontSettings?.editorLineHeight ?? undefined;
	const editorLetterSpacing = fontSettings?.editorLetterSpacing ?? undefined;
	const editorFontWeight = fontSettings?.editorFontWeight ?? undefined;
	const editorLigatures = fontSettings?.editorLigatures ?? undefined;
	const activeTheme = useResolvedTheme();

	onChangeRef.current = onChange;
	onSaveRef.current = onSave;
	onScrollPositionChangeRef.current = onScrollPositionChange;

	// biome-ignore lint/correctness/useExhaustiveDependencies: Editor instance is created once and reconfigured via dedicated effects below
	useEffect(() => {
		if (!containerRef.current) return;

		const updateListener = EditorView.updateListener.of((update) => {
			if (!update.docChanged) return;
			if (isExternalUpdateRef.current) return;
			onChangeRef.current?.(update.state.doc.toString());
		});

		const saveKeymap = keymap.of([
			{
				key: "Mod-s",
				run: () => {
					onSaveRef.current?.();
					return true;
				},
			},
		]);

		const initialHighlighting = highlightingFor(filePath, activeTheme);
		if (initialHighlighting) {
			appliedHighlightingRef.current = { filePath, theme: activeTheme };
		}

		const state = EditorState.create({
			doc: value,
			extensions: [
				lineNumbers(),
				highlightActiveLineGutter(),
				highlightSpecialChars(),
				history(),
				foldGutter({ markerDOM: buildFoldChevron }),
				codeFolding({ placeholderDOM: buildFoldPlaceholder }),
				drawSelection(),
				dropCursor(),
				EditorState.allowMultipleSelections.of(true),
				indentOnInput(),
				bracketMatching(),
				highlightActiveLine(),
				highlightSelectionMatches(),
				colorPicker,
				contourSelectionLayer,
				selectionClassTogglePlugin,
				editableCompartment.of([
					EditorState.readOnly.of(readOnly),
					EditorView.editable.of(!readOnly),
				]),
				EditorView.contentAttributes.of({
					spellcheck: "false",
				}),
				keymap.of([
					indentWithTab,
					...defaultKeymap,
					...historyKeymap,
					...searchKeymap,
					...foldKeymap,
				]),
				saveKeymap,
				highlightCompartment.of(initialHighlighting ?? []),
				themeCompartment.of([
					createCodeMirrorTheme(
						activeTheme,
						{
							fontFamily: editorFontFamily,
							fontSize: editorFontSize,
							lineHeight: editorLineHeight,
							letterSpacing: editorLetterSpacing,
							fontWeight: editorFontWeight,
							ligatures: editorLigatures,
						},
						fillHeight,
					),
				]),
				languageCompartment.of([]),
				updateListener,
			],
		});

		const view = new EditorView({
			state,
			parent: containerRef.current,
		});
		const adapter = createCodeMirrorAdapter(view);
		const reportScrollPosition = () => {
			onScrollPositionChangeRef.current?.({
				scrollTop: view.scrollDOM.scrollTop,
				scrollLeft: view.scrollDOM.scrollLeft,
			});
		};
		view.scrollDOM.addEventListener("scroll", reportScrollPosition, {
			passive: true,
		});
		const savedScrollPosition = initialScrollPositionRef.current;
		if (savedScrollPosition) {
			view.requestMeasure({
				read: () => savedScrollPosition,
				write: (position) => {
					view.scrollDOM.scrollTop = position.scrollTop;
					view.scrollDOM.scrollLeft = position.scrollLeft;
				},
			});
		}

		viewRef.current = view;
		if (editorRef) {
			editorRef.current = adapter;
		}

		return () => {
			// The passive effect cleanup can run after the editor DOM has been
			// detached and its scroll offset clamped to zero. The scroll listener
			// already saved the last real position, so do not overwrite it here.
			view.scrollDOM.removeEventListener("scroll", reportScrollPosition);
			if (editorRef?.current === adapter) {
				editorRef.current = null;
			}
			adapter.dispose();
			viewRef.current = null;
		};
	}, []);

	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;

		const currentValue = view.state.doc.toString();
		if (currentValue === value) return;

		// Guarantee flag reset regardless of whether dispatch throws (e.g. view destroyed between null-check and dispatch).
		isExternalUpdateRef.current = true;
		try {
			view.dispatch(replaceEditorDocument(view.state, value));
		} finally {
			isExternalUpdateRef.current = false;
		}
	}, [value]);

	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;

		view.dispatch({
			effects: themeCompartment.reconfigure([
				createCodeMirrorTheme(
					activeTheme,
					{
						fontFamily: editorFontFamily,
						fontSize: editorFontSize,
						lineHeight: editorLineHeight,
						letterSpacing: editorLetterSpacing,
						fontWeight: editorFontWeight,
						ligatures: editorLigatures,
					},
					fillHeight,
				),
			]),
		});
	}, [
		activeTheme,
		editorFontFamily,
		editorFontWeight,
		editorFontSize,
		editorLetterSpacing,
		editorLigatures,
		editorLineHeight,
		fillHeight,
		themeCompartment,
	]);

	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;

		view.dispatch({
			effects: editableCompartment.reconfigure([
				EditorState.readOnly.of(readOnly),
				EditorView.editable.of(!readOnly),
			]),
		});
	}, [editableCompartment, readOnly]);

	useEffect(() => {
		let cancelled = false;

		void loadLanguageSupport(language)
			.then((extension) => {
				if (cancelled) return;
				const view = viewRef.current;
				if (!view) return;

				view.dispatch({
					effects: languageCompartment.reconfigure(extension ?? []),
				});
			})
			.catch((error) => {
				if (cancelled) return;
				const view = viewRef.current;
				if (!view) return;

				console.error("[CodeEditor] Failed to load language support:", {
					error,
					language,
				});
				view.dispatch({
					effects: languageCompartment.reconfigure([]),
				});
			});

		return () => {
			cancelled = true;
		};
	}, [language, languageCompartment]);

	useEffect(() => {
		const applied = appliedHighlightingRef.current;
		if (
			applied &&
			applied.filePath === filePath &&
			applied.theme === activeTheme
		)
			return;
		let cancelled = false;
		const apply = (extension: Extension) => {
			const view = viewRef.current;
			if (cancelled || !view) return;
			appliedHighlightingRef.current = { filePath, theme: activeTheme };
			view.dispatch({ effects: highlightCompartment.reconfigure(extension) });
		};
		const ready = highlightingFor(filePath, activeTheme);
		if (ready) {
			apply(ready);
		} else if (filePath) {
			void loadLiveHighlighting(filePath)
				.then(() => apply(highlightingFor(filePath, activeTheme) ?? []))
				.catch(() => apply(getCodeSyntaxHighlighting(activeTheme)));
		}

		return () => {
			cancelled = true;
		};
	}, [activeTheme, filePath, highlightCompartment]);

	return (
		<div
			ref={containerRef}
			className={cn(
				"min-w-0",
				fillHeight ? "h-full w-full" : "w-full",
				className,
			)}
		/>
	);
}
