import { describe, expect, test } from "bun:test";
import { isInternalUrl, publicOnlyLookup } from "./internal-host";

describe("isInternalUrl", () => {
	test("public hosts pass", () => {
		expect(isInternalUrl("https://tools.example.com/mcp")).toBe(false);
		expect(isInternalUrl("https://8.8.8.8/mcp")).toBe(false);
	});

	test("an address a template resolved to is checked too", () => {
		expect(isInternalUrl("https://127.1/mcp")).toBe(true);
		expect(isInternalUrl("https://0x7f000001/mcp")).toBe(true);
		expect(isInternalUrl("not a url")).toBe(true);
	});
});

describe("publicOnlyLookup", () => {
	const resolvingTo =
		(...addresses: string[]) =>
		(
			_host: string,
			_options: unknown,
			callback: (error: Error | null, found: unknown) => void,
		) =>
			callback(
				null,
				addresses.map((address) => ({
					address,
					family: address.includes(":") ? 6 : 4,
				})),
			);

	const resolve = (fake: ReturnType<typeof resolvingTo>) =>
		new Promise<{ error: Error | null; address: unknown }>((done) =>
			publicOnlyLookup(fake as never)(
				"tools.example.com",
				{},
				(error, address) => done({ error, address }),
			),
		);

	test("a public name connects to its address", async () => {
		const { error, address } = await resolve(resolvingTo("93.184.216.34"));
		expect(error).toBeNull();
		expect(address).toBe("93.184.216.34");
	});

	test("a public-looking name that resolves inside the network is refused", async () => {
		const { error } = await resolve(resolvingTo("93.184.216.34", "10.0.0.5"));
		expect(error?.message).toContain("private or internal address");
	});
});
