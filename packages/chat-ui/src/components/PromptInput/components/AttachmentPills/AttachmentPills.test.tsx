import { afterAll, afterEach, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { cleanup, fireEvent, render } = await import("@testing-library/react");
const { AttachmentPills } = await import("./AttachmentPills");

afterEach(cleanup);
afterAll(() => {
	if (!alreadyRegistered) GlobalRegistrator.unregister();
});

const file = new File(["x"], "notes.md", { type: "text/markdown" });

test("a file from disk can be shown in its folder; one without a path cannot", () => {
	const onReveal = mock(() => {});
	const view = render(
		<AttachmentPills
			attachments={[
				{ id: "a", file, sourcePath: "/Users/me/notes.md" },
				{
					id: "b",
					file: new File(["y"], "pasted.png", { type: "text/plain" }),
				},
			]}
			onRemove={() => {}}
			onReveal={onReveal}
		/>,
	);
	const reveal = view.getAllByRole("button", { name: "Show in folder" });
	expect(reveal).toHaveLength(1);
	fireEvent.click(reveal[0] as HTMLElement);
	expect(onReveal).toHaveBeenCalledTimes(1);
	expect(onReveal.mock.calls[0]?.[0]).toMatchObject({ id: "a" });
});
