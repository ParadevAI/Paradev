import { afterAll, afterEach, describe, expect, test } from "bun:test";

const reactActGlobal = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnvironment = reactActGlobal.IS_REACT_ACT_ENVIRONMENT;
reactActGlobal.IS_REACT_ACT_ENVIRONMENT = true;
const { cleanup, render } = await import("@testing-library/react");
const { QueryClient } = await import("@tanstack/react-query");
const { workspaceTrpc } = await import("@superset/workspace-client");
const { electronTrpc } = await import("renderer/lib/electron-trpc");
const { ChatPaneActionsProvider } = await import(
	"../../../../providers/ChatPaneActionsProvider"
);
const { AttachmentRail } = await import("./AttachmentRail");

afterEach(cleanup);
afterAll(() => {
	reactActGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

describe("AttachmentRail", () => {
	test("reserves a thumbnail box per image while the bytes load", () => {
		const view = render(
			<electronTrpc.Provider
				client={electronTrpc.createClient({ links: [] })}
				queryClient={new QueryClient()}
			>
				<workspaceTrpc.Provider
					client={workspaceTrpc.createClient({ links: [] })}
					queryClient={new QueryClient()}
				>
					<ChatPaneActionsProvider workspaceId="ws">
						<AttachmentRail
							images={[
								{
									type: "image",
									path: ".superset/attachments/a-1.png",
									mimeType: "image/png",
								},
								{
									type: "image",
									path: ".superset/attachments/b-2.png",
									mimeType: "image/png",
								},
							]}
						/>
					</ChatPaneActionsProvider>
				</workspaceTrpc.Provider>
			</electronTrpc.Provider>,
		);
		const boxes = view.container.querySelectorAll(".size-40");
		expect(boxes).toHaveLength(2);
	});

	test("shows one tile for an image that appears twice", () => {
		const image = {
			type: "image" as const,
			path: ".superset/attachments/a-1.png",
			mimeType: "image/png",
		};
		const view = render(
			<electronTrpc.Provider
				client={electronTrpc.createClient({ links: [] })}
				queryClient={new QueryClient()}
			>
				<workspaceTrpc.Provider
					client={workspaceTrpc.createClient({ links: [] })}
					queryClient={new QueryClient()}
				>
					<ChatPaneActionsProvider workspaceId="ws">
						<AttachmentRail images={[image, { ...image }]} />
					</ChatPaneActionsProvider>
				</workspaceTrpc.Provider>
			</electronTrpc.Provider>,
		);
		expect(view.container.querySelectorAll(".size-40")).toHaveLength(1);
	});

	test("renders nothing without images", () => {
		const view = render(<AttachmentRail images={[]} />);
		expect(view.container.innerHTML).toBe("");
	});
});
