import { expect, test } from "bun:test";
import { EDITED_HREF, remarkEditedMark } from "./remarkEditedMark";

test("the marker joins the last paragraph, or follows a list on its own line", () => {
	const paragraph = {
		type: "root",
		children: [
			{ type: "paragraph", children: [{ type: "text", value: "hi" }] },
		],
	};
	remarkEditedMark()(paragraph);
	expect(paragraph.children[0]?.children.at(-1) as unknown).toEqual({
		type: "link",
		url: EDITED_HREF,
		children: [],
	});

	const list = { type: "root", children: [{ type: "list", children: [] }] };
	remarkEditedMark()(list);
	expect(list.children.at(-1)?.type).toBe("paragraph");
});
