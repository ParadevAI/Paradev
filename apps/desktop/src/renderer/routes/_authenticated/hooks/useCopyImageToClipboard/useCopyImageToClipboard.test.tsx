import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import type { TRPCLink } from "@trpc/client";
import type { AppRouter } from "lib/trpc/routers";

const reactActGlobal = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnvironment = reactActGlobal.IS_REACT_ACT_ENVIRONMENT;
reactActGlobal.IS_REACT_ACT_ENVIRONMENT = true;
const { cleanup, renderHook } = await import("@testing-library/react");
const { QueryClient } = await import("@tanstack/react-query");
const { observable } = await import("@trpc/server/observable");
const { electronTrpc } = await import("renderer/lib/electron-trpc");
const { useCopyImageToClipboard } = await import("./useCopyImageToClipboard");

afterEach(cleanup);
afterAll(() => {
	reactActGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

const PNG = "data:image/png;base64,iVBORw0KGgo=";

function renderCopy(writeInRenderer: (png: Blob) => Promise<void>) {
	const toBase64 = mock(async (blob: Blob) => `${blob.type}:${blob.size}`);
	const mainCalls: { path: string; input: unknown }[] = [];
	const link: TRPCLink<AppRouter> = () => (call) =>
		observable((observer) => {
			mainCalls.push({ path: call.op.path, input: call.op.input });
			observer.next({ result: { data: undefined } });
			observer.complete();
		});
	const { result } = renderHook(
		() => useCopyImageToClipboard({ writeInRenderer, toBase64 }),
		{
			wrapper: ({ children }) => (
				<electronTrpc.Provider
					client={electronTrpc.createClient({ links: [link] })}
					queryClient={new QueryClient()}
				>
					{children}
				</electronTrpc.Provider>
			),
		},
	);
	return { copy: result.current, mainCalls };
}

describe("useCopyImageToClipboard", () => {
	test("writes through the page clipboard when it accepts", async () => {
		const write = mock(async (_png: Blob) => {});
		const { copy, mainCalls } = renderCopy(write);
		await copy(PNG);
		expect(write).toHaveBeenCalledTimes(1);
		expect(mainCalls).toEqual([]);
	});

	test("hands the PNG to the main process when the page clipboard refuses", async () => {
		const { copy, mainCalls } = renderCopy(async () => {
			throw new DOMException("Document is not focused.", "NotAllowedError");
		});
		await copy(PNG);
		expect(mainCalls).toEqual([
			{ path: "external.copyImage", input: { pngBase64: "image/png:8" } },
		]);
	});
});
