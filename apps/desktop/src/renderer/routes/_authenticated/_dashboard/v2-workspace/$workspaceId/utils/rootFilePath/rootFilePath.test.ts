import { describe, expect, test } from "bun:test";
import { rootFilePath } from "./rootFilePath";

const api = { repositoryId: "r-api", name: "api" };
const web = { repositoryId: "r-web", name: "web" };

describe("rootFilePath", () => {
	test("keeps the path for one checkout", () => {
		expect(rootFilePath([api], "r-api", "src/a.ts")).toBe("src/a.ts");
	});

	test("prefixes the checkout's folder when there are several", () => {
		expect(rootFilePath([api, web], "r-web", "src/a.ts")).toBe("web/src/a.ts");
	});

	test("keeps the path for an unknown repository", () => {
		expect(rootFilePath([api, web], "r-gone", "src/a.ts")).toBe("src/a.ts");
	});
});
