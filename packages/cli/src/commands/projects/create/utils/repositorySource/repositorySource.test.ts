import { describe, expect, test } from "bun:test";
import { repositorySource } from "./repositorySource";

describe("repositorySource", () => {
	test("URLs and scp-style remotes are cloned; paths are local", () => {
		expect(repositorySource("https://github.com/o/web")).toEqual({
			kind: "clone",
			url: "https://github.com/o/web",
		});
		expect(repositorySource("git@github.com:o/web.git").kind).toBe("clone");
		expect(repositorySource("~/src/api")).toEqual({
			kind: "local",
			path: "~/src/api",
		});
		expect(repositorySource("./api").kind).toBe("local");
	});

	test("an scp-style remote without a user is cloned", () => {
		expect(repositorySource("github.com:o/web")).toEqual({
			kind: "clone",
			url: "github.com:o/web",
		});
	});

	test("a colon after a slash, or a Windows drive, is a local path", () => {
		expect(repositorySource("/srv/a:b").kind).toBe("local");
		expect(repositorySource("./a:b").kind).toBe("local");
		expect(repositorySource("~/a:b").kind).toBe("local");
		expect(repositorySource("C:\\src\\api").kind).toBe("local");
		expect(repositorySource("C:/src/api").kind).toBe("local");
	});
});
