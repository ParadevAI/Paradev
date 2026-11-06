import { afterAll, afterEach, describe, expect, test } from "bun:test";
import type { AppRouter } from "@superset/host-service/trpc";
import type { TRPCLink } from "@trpc/client";

const reactActGlobal = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnvironment = reactActGlobal.IS_REACT_ACT_ENVIRONMENT;
reactActGlobal.IS_REACT_ACT_ENVIRONMENT = true;
const { cleanup, fireEvent, render, waitFor, within } = await import(
	"@testing-library/react"
);
const { QueryClient } = await import("@tanstack/react-query");
const { observable } = await import("@trpc/server/observable");
const { workspaceTrpc } = await import("@superset/workspace-client");
const { electronTrpc } = await import("renderer/lib/electron-trpc");
const { ChatPaneActionsProvider } = await import(
	"../../../../providers/ChatPaneActionsProvider"
);
const { AttachmentImage } = await import("../../components/AttachmentImage");
const { galleryImageId } = await import("../../utils/galleryImages");
const { ChatImageGalleryProvider } = await import("./ChatImageGalleryProvider");

afterEach(cleanup);
afterAll(() => {
	reactActGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

const DIR = ".superset/attachments";
const images = ["a", "b", "c"].map((name) => ({
	id: galleryImageId(`m-${name}`, `${DIR}/${name}.png`),
	path: `${DIR}/${name}.png`,
	mimeType: "image/png",
	filename: `${name}.png`,
}));

function contentFor(absolutePath: string): string {
	return btoa(absolutePath.split("/").pop() ?? "");
}

function renderGallery(thumbnails: number) {
	const reads: string[] = [];
	const link: TRPCLink<AppRouter> = () => (call) =>
		observable((observer) => {
			let data: unknown;
			if (call.op.path === "workspace.get") data = { worktreePath: "/work" };
			else {
				const { absolutePath } = call.op.input as { absolutePath: string };
				reads.push(absolutePath);
				data = {
					kind: "bytes",
					content: contentFor(absolutePath),
					byteLength: 8,
					exceededLimit: false,
					revision: "r1",
				};
			}
			observer.next({ result: { data } });
			observer.complete();
		});
	const view = render(
		<electronTrpc.Provider
			client={electronTrpc.createClient({ links: [] })}
			queryClient={new QueryClient()}
		>
			<workspaceTrpc.Provider
				client={workspaceTrpc.createClient({ links: [link] })}
				queryClient={new QueryClient()}
			>
				<ChatPaneActionsProvider workspaceId="ws">
					<ChatImageGalleryProvider images={images}>
						{images.slice(0, thumbnails).map((image) => (
							<AttachmentImage
								key={image.id}
								owner={image.id.includes("m-a") ? "m-a" : "m-b"}
								path={image.path}
								type={image.mimeType}
							/>
						))}
					</ChatImageGalleryProvider>
				</ChatPaneActionsProvider>
			</workspaceTrpc.Provider>
		</electronTrpc.Provider>,
	);
	return { view, reads };
}

function shownSrc(view: ReturnType<typeof render>): string | null {
	return within(view.getByRole("dialog")).getByRole("img").getAttribute("src");
}

describe("ChatImageGalleryProvider", () => {
	test("a thumbnail opens its image and the overlay steps through every image, mounted or not", async () => {
		const { view } = renderGallery(1);
		fireEvent.click(
			await waitFor(() => view.getByRole("button", { name: "Preview a.png" })),
		);
		await waitFor(() =>
			expect(shownSrc(view)).toBe(`data:image/png;base64,${btoa("a.png")}`),
		);
		expect(view.getByText("1 of 3")).toBeTruthy();

		fireEvent.keyDown(window, { key: "ArrowRight" });
		await waitFor(() =>
			expect(shownSrc(view)).toBe(`data:image/png;base64,${btoa("b.png")}`),
		);
		fireEvent.click(view.getByRole("button", { name: "Next image" }));
		await waitFor(() =>
			expect(shownSrc(view)).toBe(`data:image/png;base64,${btoa("c.png")}`),
		);
		expect(view.getByText("3 of 3")).toBeTruthy();
	});

	test("stepping past either end wraps around to the other", async () => {
		const { view } = renderGallery(1);
		fireEvent.click(
			await waitFor(() => view.getByRole("button", { name: "Preview a.png" })),
		);
		await waitFor(() => view.getByText("1 of 3"));
		fireEvent.keyDown(window, { key: "ArrowLeft" });
		await waitFor(() =>
			expect(shownSrc(view)).toBe(`data:image/png;base64,${btoa("c.png")}`),
		);
		expect(view.getByText("3 of 3")).toBeTruthy();
		fireEvent.click(view.getByRole("button", { name: "Next image" }));
		await waitFor(() =>
			expect(shownSrc(view)).toBe(`data:image/png;base64,${btoa("a.png")}`),
		);
		expect(view.getByText("1 of 3")).toBeTruthy();
	});

	test("prefetches the neighbours of the open image, across the wrap", async () => {
		const { view, reads } = renderGallery(1);
		await waitFor(() => view.getByRole("button", { name: "Preview a.png" }));
		expect(reads).not.toContain(`/work/${DIR}/b.png`);
		expect(reads).not.toContain(`/work/${DIR}/c.png`);
		fireEvent.click(view.getByRole("button", { name: "Preview a.png" }));
		await waitFor(() => {
			expect(reads).toContain(`/work/${DIR}/b.png`);
			expect(reads).toContain(`/work/${DIR}/c.png`);
		});
	});

	test("closing returns focus to the thumbnail of the image shown", async () => {
		const { view } = renderGallery(2);
		const first = await waitFor(() =>
			view.getByRole("button", { name: "Preview a.png" }),
		);
		fireEvent.click(first);
		await waitFor(() => view.getByRole("dialog"));
		fireEvent.keyDown(window, { key: "ArrowRight" });
		await waitFor(() =>
			expect(shownSrc(view)).toBe(`data:image/png;base64,${btoa("b.png")}`),
		);
		fireEvent.keyDown(window, { key: "Escape" });
		await waitFor(() =>
			expect(document.activeElement).toBe(
				view.getByRole("button", { name: "Preview b.png" }),
			),
		);
	});
});
