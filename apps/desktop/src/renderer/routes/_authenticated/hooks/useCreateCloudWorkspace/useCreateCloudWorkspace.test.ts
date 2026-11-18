import { expect, test } from "bun:test";

const RENDERER_ROOT = `${import.meta.dir}/../../../..`;
const CREATE_CALL = /cloudWorkspace\s*\.\s*create\s*\./;

test("only useCreateCloudWorkspace calls cloudWorkspace.create, so every create seeds its launch pane", async () => {
	const callers: string[] = [];
	for await (const path of new Bun.Glob("**/*.{ts,tsx}").scan(RENDERER_ROOT)) {
		if (/\.test\.tsx?$/.test(path)) continue;
		const source = await Bun.file(`${RENDERER_ROOT}/${path}`).text();
		if (CREATE_CALL.test(source)) callers.push(path);
	}
	expect(callers).toEqual([
		"routes/_authenticated/hooks/useCreateCloudWorkspace/useCreateCloudWorkspace.ts",
	]);
});
