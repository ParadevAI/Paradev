import { describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { $createListItemNode, $createListNode } from "@lexical/list";
import {
	$createParagraphNode,
	$createTextNode,
	$getRoot,
	createEditor,
} from "lexical";
import { COMPOSER_NODES } from "../../constants";

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();

const { $clipboardData } = await import("./clipboardData");

describe("$clipboardData", () => {
	test("a copied list keeps its markers as plain text", () => {
		const editor = createEditor({
			nodes: COMPOSER_NODES,
			onError: (error) => {
				throw error;
			},
		});
		let plain = "";
		editor.update(
			() => {
				const list = $createListNode("bullet").append(
					$createListItemNode().append($createTextNode("a")),
					$createListItemNode().append($createTextNode("b")),
				);
				const root = $getRoot().append(
					$createParagraphNode().append($createTextNode("Plan:")),
					list,
				);
				root.select(0, root.getChildrenSize());
				plain = $clipboardData()["text/plain"];
			},
			{ discrete: true },
		);
		expect(plain).toBe("Plan:\n- a\n- b");
	});
});
