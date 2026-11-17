import { expect, test } from "bun:test";
import { displayHost } from "./displayHost";

test("displayHost names the site without www or a trailing dot", () => {
	expect(displayHost("https://WWW.Example.com./docs")).toBe("example.com");
	expect(displayHost("https://docs.example.com/a")).toBe("docs.example.com");
	expect(displayHost("not a url")).toBe("not a url");
});
