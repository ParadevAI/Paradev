import { afterAll, afterEach, describe, expect, test } from "bun:test";
import type { AppRouter } from "@superset/host-service/trpc";
import { MAX_CHAT_IMAGE_BYTES } from "@superset/shared/attachment-limits";
import type { TRPCLink } from "@trpc/client";

const reactActGlobal = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnvironment = reactActGlobal.IS_REACT_ACT_ENVIRONMENT;
reactActGlobal.IS_REACT_ACT_ENVIRONMENT = true;
const { cleanup, fireEvent, render, waitFor } = await import(
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
const { AttachmentImage } = await import("./AttachmentImage");

afterEach(cleanup);
afterAll(() => {
	reactActGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

const THUMBNAIL_CAP = 5 * 1024 * 1024;

function read(exceededLimit: boolean) {
	return {
		kind: "bytes" as const,
		content: "iVBORw0KGgo=",
		byteLength: 8,
		exceededLimit,
		revision: "r1",
	};
}

function renderImage(readFile: (maxBytes: number) => ReturnType<typeof read>) {
	const link: TRPCLink<AppRouter> = () => (call) =>
		observable((observer) => {
			try {
				const data =
					call.op.path === "workspace.get"
						? { worktreePath: "/work" }
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
				queryClient={new QueryClient()}
			>
				<ChatPaneActionsProvider workspaceId="ws">
					<AttachmentImage
						path=".superset/attachments/big.png"
						type="image/png"
					/>
				</ChatPaneActionsProvider>
			</workspaceTrpc.Provider>
		</electronTrpc.Provider>,
	);
}

const tile = { name: "Preview big.png" };

describe("AttachmentImage", () => {
	test("a file under the thumbnail cap renders as a data URL thumbnail", async () => {
		const view = renderImage(() => read(false));
		const image = await waitFor(() => view.getByAltText("big.png"));
		expect(image.getAttribute("src")).toBe(
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
		await waitFor(() => view.getByRole("button", { name: "Close preview" }));
		expect(view.getByAltText("big.png").getAttribute("src")).toBe(
			"data:image/png;base64,iVBORw0KGgo=",
		);
	});

	test("a failed read of a file over the cap falls back to the file name", async () => {
		const view = renderImage((maxBytes) => {
			if (maxBytes > THUMBNAIL_CAP) throw new Error("read failed");
			return read(true);
		});
		fireEvent.click(await waitFor(() => view.getByRole("button", tile)));
		await waitFor(() =>
			expect(view.queryAllByRole("button", tile).length).toBe(0),
		);
		expect(view.getByText("big.png")).toBeTruthy();
	});
});
