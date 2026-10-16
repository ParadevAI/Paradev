import { afterAll, afterEach, describe, expect, test } from "bun:test";
import type { AppRouter } from "@superset/host-service/trpc";
import { MAX_CHAT_IMAGE_BYTES } from "@superset/shared/attachment-limits";
import type { TRPCLink } from "@trpc/client";

const reactActGlobal = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnvironment = reactActGlobal.IS_REACT_ACT_ENVIRONMENT;
reactActGlobal.IS_REACT_ACT_ENVIRONMENT = true;
const { cleanup, fireEvent, render, waitFor, within } = await import(
	"@testing-library/react"
);
const { QueryClient } = await import("@tanstack/react-query");
const { TRPCClientError } = await import("@trpc/client");
const { observable } = await import("@trpc/server/observable");
const { workspaceTrpc } = await import("@superset/workspace-client");
const { electronTrpc } = await import("renderer/lib/electron-trpc");
const { ChatPaneActionsProvider } = await import(
	"../../../../providers/ChatPaneActionsProvider"
);
const { ChatImageGalleryProvider } = await import(
	"../../providers/ChatImageGalleryProvider"
);
const { galleryImageId } = await import("../../utils/galleryImages");
const { AttachmentImage } = await import("./AttachmentImage");

afterEach(cleanup);
afterAll(() => {
	reactActGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

const THUMBNAIL_CAP = 5 * 1024 * 1024;
const PATH = ".superset/attachments/big.png";
const image = {
	id: galleryImageId("m1", PATH),
	path: PATH,
	mimeType: "image/png",
	filename: "big.png",
};

function read(exceededLimit: boolean) {
	return {
		kind: "bytes" as const,
		content: "iVBORw0KGgo=",
		byteLength: 8,
		exceededLimit,
		revision: "r1",
	};
}

function renderImage(
	readFile: (maxBytes: number) => ReturnType<typeof read>,
	getWorkspace: () => unknown = () => ({ worktreePath: "/work" }),
) {
	const link: TRPCLink<AppRouter> = () => (call) =>
		observable((observer) => {
			try {
				const data =
					call.op.path === "workspace.get"
						? getWorkspace()
						: readFile((call.op.input as { maxBytes: number }).maxBytes);
				observer.next({ result: { data } });
				observer.complete();
			} catch (error) {
				observer.error(TRPCClientError.from(error as Error));
			}
		});
	return render(
		<electronTrpc.Provider
			client={electronTrpc.createClient({ links: [] })}
			queryClient={new QueryClient()}
		>
			<workspaceTrpc.Provider
				client={workspaceTrpc.createClient({ links: [link] })}
				queryClient={
					new QueryClient({ defaultOptions: { queries: { retry: false } } })
				}
			>
				<ChatPaneActionsProvider workspaceId="ws">
					<ChatImageGalleryProvider images={[image]}>
						<AttachmentImage owner="m1" path={PATH} type="image/png" />
					</ChatImageGalleryProvider>
				</ChatPaneActionsProvider>
			</workspaceTrpc.Provider>
		</electronTrpc.Provider>,
	);
}

const tile = { name: "Preview big.png" };

describe("AttachmentImage", () => {
	test("a file under the thumbnail cap renders as a data URL thumbnail", async () => {
		const view = renderImage(() => read(false));
		const thumbnail = await waitFor(() => view.getByAltText("big.png"));
		expect(thumbnail.getAttribute("src")).toBe(
			"data:image/png;base64,iVBORw0KGgo=",
		);
	});

	test("a file over the cap shows a placeholder that opens the overlay from a larger read", async () => {
		const view = renderImage((maxBytes) =>
			read(maxBytes < MAX_CHAT_IMAGE_BYTES),
		);
		const button = await waitFor(() => view.getByRole("button", tile));
		expect(button.querySelector("img")).toBeNull();

		fireEvent.click(button);
		const dialog = await waitFor(() => view.getByRole("dialog"));
		await waitFor(() =>
			expect(within(dialog).getByRole("img").getAttribute("src")).toBe(
				"data:image/png;base64,iVBORw0KGgo=",
			),
		);
	});

	test("a failed workspace lookup falls back to the file name", async () => {
		const view = renderImage(
			() => read(false),
			() => {
				throw new Error("no workspace");
			},
		);
		await waitFor(() => view.getByText("big.png"));
		expect(view.queryByRole("button", tile)).toBeNull();
	});

	test("a workspace without a worktree path falls back to the file name", async () => {
		const view = renderImage(
			() => read(false),
			() => ({ worktreePath: null }),
		);
		await waitFor(() => view.getByText("big.png"));
	});

	test("a failed read of a file over the cap says so in the overlay", async () => {
		const view = renderImage((maxBytes) => {
			if (maxBytes > THUMBNAIL_CAP) throw new Error("read failed");
			return read(true);
		});
		fireEvent.click(await waitFor(() => view.getByRole("button", tile)));
		await waitFor(() => view.getByText("Couldn't load big.png"));
		expect(view.getByRole("button", tile)).toBeTruthy();
	});
});
