import { expect, test } from "bun:test";
import {
	type CatalogModel,
	filterModelCatalog,
	runtimeDefaultOption,
	uniqueModels,
} from "./index";

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
	expect(
		filterModelCatalog(models, { query: "PRIVATE/" }).map((model) => model.id),
	).toEqual(["private/custom"]);
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

test("the runtime default names the model it resolves to", () => {
	const models = [
		{ id: "default", label: "Default (recommended)", description: "Opus" },
		{ id: "sonnet", label: "Sonnet" },
	];
	expect(runtimeDefaultOption(models, "default")).toEqual({
		id: "default",
		label: "Opus",
	});
	expect(runtimeDefaultOption(models, "sonnet")).toEqual({
		id: "sonnet",
		label: "Sonnet",
	});
	expect(
		runtimeDefaultOption([{ id: "default", label: "Default" }], "default"),
	).toBeUndefined();
	expect(runtimeDefaultOption(models, undefined)).toBeUndefined();
});
