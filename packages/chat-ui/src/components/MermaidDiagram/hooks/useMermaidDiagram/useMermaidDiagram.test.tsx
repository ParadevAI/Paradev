import { afterAll, afterEach, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, renderHook } = await import("@testing-library/react");
const { MermaidRendererProvider } = await import(
	"../../providers/MermaidRendererProvider"
);
const { useMermaidDiagram } = await import("./useMermaidDiagram");
type MermaidRenderer = import("../../types").MermaidRenderer;

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

const settle = () => act(() => new Promise((done) => setTimeout(done, 0)));

function renderDiagram(renderer: MermaidRenderer, source: string | null) {
	return renderHook(({ text }) => useMermaidDiagram(text), {
		initialProps: { text: source },
		wrapper: ({ children }) => (
			<MermaidRendererProvider renderer={renderer}>
				{children}
			</MermaidRendererProvider>
		),
	});
}

test("draws nothing without a source and draws a source once", async () => {
	const calls: string[] = [];
	const renderer: MermaidRenderer = async (source) => {
		calls.push(source);
		return `<svg data-source="${source}"></svg>`;
	};
	const idle = renderDiagram(renderer, null);
	expect(idle.result.current).toEqual({ status: "idle" });

	const first = renderDiagram(renderer, "graph LR; A-->B");
	expect(first.result.current.status).toBe("rendering");
	await settle();
	expect(first.result.current).toEqual({
		status: "ready",
		svg: '<svg data-source="graph LR; A-->B"></svg>',
	});
	first.unmount();

	const again = renderDiagram(renderer, "graph LR; A-->B");
	expect(again.result.current.status).toBe("ready");
	expect(calls).toEqual(["graph LR; A-->B"]);
});

test("keeps the whole parse error", async () => {
	const renderer: MermaidRenderer = async () => {
		throw new Error("Parse error on line 2:\n...\nExpecting 'SEMI'\n");
	};
	const view = renderDiagram(renderer, "graph LR; A-->");
	await settle();
	expect(view.result.current).toEqual({
		status: "error",
		error: "Parse error on line 2:\n...\nExpecting 'SEMI'",
	});
	await act(async () => view.rerender({ text: null }));
	expect(view.result.current).toEqual({ status: "idle" });
});

test("draws the same source again for another renderer", async () => {
	const first = renderDiagram(
		async () => "<svg data-renderer='first'></svg>",
		"graph TD; A-->B",
	);
	await settle();
	first.unmount();

	const calls: string[] = [];
	const second = renderDiagram(async (source) => {
		calls.push(source);
		return "<svg data-renderer='second'></svg>";
	}, "graph TD; A-->B");
	expect(second.result.current.status).toBe("rendering");
	await settle();
	expect(calls).toEqual(["graph TD; A-->B"]);
	expect(second.result.current).toEqual({
		status: "ready",
		svg: "<svg data-renderer='second'></svg>",
	});
});
