import { afterAll, afterEach, describe, expect, test } from "bun:test";
import type { PromptInputAttachment } from "@superset/chat-ui/PromptInput";

const reactActGlobal = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnvironment = reactActGlobal.IS_REACT_ACT_ENVIRONMENT;
reactActGlobal.IS_REACT_ACT_ENVIRONMENT = true;
const { cleanup, fireEvent, render } = await import("@testing-library/react");
const { QueryClient } = await import("@tanstack/react-query");
const { electronTrpc } = await import("renderer/lib/electron-trpc");
const { useAttachmentPreview } = await import("./useAttachmentPreview");

afterEach(cleanup);
afterAll(() => {
	reactActGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

const pills: PromptInputAttachment[] = [
	{
		id: "shot",
		file: new File(["png"], "shot.png", { type: "image/png" }),
		previewUrl: "blob:shot",
	},
	{
		id: "notes",
		file: new File(["md"], "notes.md", { type: "text/markdown" }),
	},
];

function Pills() {
	const { onAttachmentClick, overlay } = useAttachmentPreview();
	return (
		<>
			{pills.map((pill) => (
				<button
					key={pill.id}
					onClick={() => onAttachmentClick(pill)}
					type="button"
				>
					{pill.file.name}
				</button>
			))}
			{overlay}
		</>
	);
}

function renderPills() {
	return render(
		<electronTrpc.Provider
			client={electronTrpc.createClient({ links: [] })}
			queryClient={new QueryClient()}
		>
			<Pills />
		</electronTrpc.Provider>,
	);
}

describe("useAttachmentPreview", () => {
	test("an image pill opens the overlay on its own preview url", () => {
		const view = renderPills();
		fireEvent.click(view.getByRole("button", { name: "shot.png" }));
		expect(view.getByAltText("shot.png").getAttribute("src")).toBe("blob:shot");
		expect(view.getByRole("button", { name: "Close preview" })).toBeTruthy();
	});

	test("a pill that is not an image opens nothing", () => {
		const view = renderPills();
		fireEvent.click(view.getByRole("button", { name: "notes.md" }));
		expect(view.queryByRole("button", { name: "Close preview" })).toBeNull();
	});
});
