import { expect, test } from "bun:test";
import { type CatalogModel, filterModelCatalog, uniqueModels } from "./index";

const models: CatalogModel[] = [
	{
		id: "provider/text",
		label: "Text",
		metadata: { provider: "provider", toolCall: true },
	},
	{
		id: "provider/image",
		label: "Image",
		metadata: { provider: "provider", toolCall: false },
	},
	{ id: "private/custom", label: "Custom" },
];
test("capability filters retain models with unknown metadata", () => {
	expect(
		filterModelCatalog(models, { requireTools: true }).map((model) => model.id),
	).toEqual(["provider/text", "private/custom"]);
});
test("visibility and provider filters preserve the selected model", () => {
	expect(
		filterModelCatalog(models, {
			providers: ["provider"],
			hiddenIds: ["provider/text"],
			selectedId: "private/custom",
		}).map((model) => model.id),
	).toEqual(["provider/image", "private/custom"]);
});
test("search matches exact IDs and labels without merging provider identities", () => {
	expect(filterModelCatalog(models, { query: "PRIVATE/" })).toEqual([
		models[2],
	]);
	expect(
		uniqueModels([
			{ id: "a/model", label: "Model" },
			{ id: "b/model", label: "Model" },
			{ id: "a/model", label: "Duplicate" },
		]),
	).toHaveLength(2);
});
test("unusable model IDs are excluded", () => {
	expect(
		uniqueModels([
			{ id: "", label: "Empty" },
			{ id: "bad\nmodel", label: "Control" },
		]),
	).toEqual([]);
});

test("coding pickers exclude known non-text models but keep an existing selection", () => {
	const image = {
		id: "image",
		label: "Image",
		metadata: { provider: "a", outputModalities: ["image"] },
	};
	expect(filterModelCatalog([image], { requireTextOutput: true })).toEqual([]);
	expect(
		filterModelCatalog([image], {
			requireTextOutput: true,
			selectedId: "image",
		}),
	).toEqual([image]);
});
