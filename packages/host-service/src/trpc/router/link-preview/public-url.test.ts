import { describe, expect, it } from "bun:test";
import {
	assertPublicTarget,
	isPublicAddress,
	LinkPreviewUnavailableError,
} from "./public-url";

const neverLookedUp = async () => {
	throw new Error("a refused literal must not reach DNS");
};

describe("isPublicAddress", () => {
	it.each([
		"0.0.0.0",
		"127.0.0.1",
		"10.0.0.1",
		"100.64.0.1",
		"169.254.169.254",
		"172.20.1.1",
		"192.168.1.1",
		"192.0.2.1",
		"198.18.0.1",
		"224.0.0.1",
		"::",
		"::1",
		"::127.0.0.1",
		"::ffff:127.0.0.1",
		"::ffff:10.0.0.1",
		"fc00::1",
		"fd12:3456::1",
		"fe80::1",
		"fe80::1%en0",
		"fec0::1",
		"ff02::1",
		"2001:db8::1",
		"not-an-address",
	])("refuses %s", (address) => {
		expect(isPublicAddress(address)).toBe(false);
	});

	it.each([
		"8.8.8.8",
		"172.32.0.1",
		"2606:4700:4700::1111",
		"::ffff:8.8.8.8",
	])("accepts %s", (address) => {
		expect(isPublicAddress(address)).toBe(true);
	});
});

describe("assertPublicTarget", () => {
	it.each([
		"file:///tmp/page.html",
		"ftp://example.com/a",
		"https://user:secret@example.com/",
		"https://user@example.com/",
		"http://localhost:3000/",
		"http://LOCALHOST./",
		"http://app.localhost/",
		"http://printer.local/",
		"http://127.0.0.1:8080/",
		"http://0x7f.0.0.1/",
		"http://2130706433/",
		"http://10.0.0.5/",
		"http://192.168.1.1/",
		"http://169.254.169.254/latest/meta-data/",
		"http://[::1]:3000/",
		"http://[::ffff:127.0.0.1]/",
		"http://[fd00::1]/",
	])("refuses %s without asking DNS", async (url) => {
		await expect(
			assertPublicTarget(new URL(url), neverLookedUp),
		).rejects.toBeInstanceOf(LinkPreviewUnavailableError);
	});

	it.each([
		["a private address", ["10.1.2.3"]],
		["a public and a private address", ["93.184.216.34", "127.0.0.1"]],
		["nothing", []],
	])("refuses a name that resolves to %s", async (_name, addresses) => {
		await expect(
			assertPublicTarget(new URL("https://intranet.example.com/"), async () => [
				...addresses,
			]),
		).rejects.toBeInstanceOf(LinkPreviewUnavailableError);
	});

	it("refuses a name that does not resolve", async () => {
		await expect(
			assertPublicTarget(new URL("https://nowhere.example.com/"), async () => {
				throw new Error("ENOTFOUND");
			}),
		).rejects.toBeInstanceOf(LinkPreviewUnavailableError);
	});

	it("accepts public literals and names that resolve to public addresses", async () => {
		const asked: string[] = [];
		await assertPublicTarget(new URL("https://8.8.8.8/"), neverLookedUp);
		await assertPublicTarget(
			new URL("https://Example.com./docs"),
			async (host) => {
				asked.push(host);
				return ["93.184.216.34", "2606:2800:220:1::1"];
			},
		);
		expect(asked).toEqual(["example.com"]);
	});
});
