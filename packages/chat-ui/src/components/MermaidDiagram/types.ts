/** Turns Mermaid source into SVG markup, or rejects with the parse error. */
export type MermaidRenderer = (source: string) => Promise<string>;

export type MermaidDiagramState =
	| { status: "idle" }
	| { status: "rendering" }
	| { status: "ready"; svg: string }
	| { status: "error"; error: string };
