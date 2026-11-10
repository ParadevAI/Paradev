import { afterAll, afterEach, describe, expect, test } from "bun:test";
import type { TRPCLink } from "@trpc/client";
import type { AppRouter } from "lib/trpc/routers";

const reactActGlobal = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnvironment = reactActGlobal.IS_REACT_ACT_ENVIRONMENT;
reactActGlobal.IS_REACT_ACT_ENVIRONMENT = true;
const { cleanup, fireEvent, render, waitFor } = await import(
	"@testing-library/react"
);
const { QueryClient } = await import("@tanstack/react-query");
const { observable } = await import("@trpc/server/observable");
const { electronTrpc } = await import("renderer/lib/electron-trpc");
const { SafeImage } = await import("./SafeImage");

afterEach(cleanup);
afterAll(() => {
	reactActGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

const ATTACHMENT =
	"https://github.com/user-attachments/assets/eba1526e-7388-4ed6-b058-c2ffcca091dd";
const SIGNED = "https://signed.example/shot.png";

function renderImage(
	src: string,
	signedUrl: string | null,
	queryClient = new QueryClient(),
) {
	const asked: unknown[] = [];
	const link: TRPCLink<AppRouter> = () => (call) =>
		observable((observer) => {
			asked.push(call.op.input);
			observer.next({ result: { data: { url: signedUrl } } });
			observer.complete();
		});
	const view = render(
		<electronTrpc.Provider
			client={electronTrpc.createClient({ links: [link] })}
			queryClient={queryClient}
		>
			<SafeImage src={src} alt="shot" />
		</electronTrpc.Provider>,
	);
	return { view, asked };
}

describe("SafeImage on the web", () => {
	test("a private repository's attachment reloads from GitHub's signed URL", async () => {
		const { view, asked } = renderImage(ATTACHMENT, SIGNED);
		const image = view.getByAltText("shot");
		expect(image.getAttribute("src")).toBe(ATTACHMENT);
		expect(asked).toEqual([]);

		fireEvent.error(image);
		await waitFor(() =>
			expect(view.getByAltText("shot").getAttribute("src")).toBe(SIGNED),
		);
		expect(asked).toEqual([{ url: ATTACHMENT }]);
	});

	test("an attachment GitHub won't sign shows the could-not-load placeholder", async () => {
		const { view } = renderImage(ATTACHMENT, null);
		fireEvent.error(view.getByAltText("shot"));
		await waitFor(() => view.getByText("Could not load image"));
	});

	test("after a lookup finds no login, the next mount asks again", async () => {
		const queryClient = new QueryClient();
		const before = renderImage(ATTACHMENT, null, queryClient);
		fireEvent.error(before.view.getByAltText("shot"));
		await waitFor(() => before.view.getByText("Could not load image"));
		before.view.unmount();

		const after = renderImage(ATTACHMENT, SIGNED, queryClient);
		fireEvent.error(after.view.getByAltText("shot"));
		await waitFor(() =>
			expect(after.view.getByAltText("shot").getAttribute("src")).toBe(SIGNED),
		);
	});

	test("any other web image that fails shows the placeholder without asking GitHub", async () => {
		const { view, asked } = renderImage("https://example.com/x.png", SIGNED);
		fireEvent.error(view.getByAltText("shot"));
		await waitFor(() => view.getByText("Could not load image"));
		expect(asked).toEqual([]);
	});
});
