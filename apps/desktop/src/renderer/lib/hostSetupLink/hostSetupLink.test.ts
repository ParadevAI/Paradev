import { describe, expect, test } from "bun:test";
import { parseDeepLinkPath } from "../parseDeepLinkPath";
import { parseSshUri, readHostSetupLink } from "./hostSetupLink";

describe("parseSshUri", () => {
	test("accepts ssh://user@host with or without a port", () => {
		for (const uri of [
			"ssh://me@box.example.com",
			"ssh://me@box.example.com:2222",
			"ssh://ibssh_AbC-12_x.y@ssh.example.test:2222",
			"ssh://root@10.0.0.5:22",
			"ssh://me@devbox:65535",
		]) {
			expect(parseSshUri(uri)).toBe(uri);
		}
	});

	test("refuses ssh options, shell characters and anything but user, host and port", () => {
		for (const uri of [
			"",
			"me@box",
			"devbox",
			"sftp://me@box",
			"SSH://me@box",
			"ssh://box",
			"ssh://@box",
			"ssh://-oProxyCommand=evil@box",
			"ssh://me@-oProxyCommand=evil",
			"ssh://me@box.-bad.com",
			"ssh://me@box..com",
			"ssh://me:secret@box",
			"ssh://me@box:0",
			"ssh://me@box:022",
			"ssh://me@box:65536",
			"ssh://me@box:22/",
			"ssh://me@box/path",
			"ssh://me@box?x=1",
			"ssh://me@[::1]:22",
			"ssh://me@box;rm",
			"ssh://me$(id)@box",
			"ssh://me`id`@box",
			"ssh://me@box extra",
			"ssh://me@box\n",
			"ssh://me%40x@box",
			" ssh://me@box",
		]) {
			expect(parseSshUri(uri)).toBeNull();
		}
	});
});

describe("readHostSetupLink", () => {
	const read = (path: string) => {
		const { to, search } = parseDeepLinkPath(path);
		return readHostSetupLink(to, search);
	};

	test("reads the encoded address from a hosts settings link", () => {
		const ssh = encodeURIComponent("ssh://me@box.example.com:2222");
		expect(read(`/settings/hosts?ssh=${ssh}`)).toEqual({
			target: "ssh://me@box.example.com:2222",
		});
		expect(read(`/settings/hosts/?ssh=${ssh}`)).toEqual({
			target: "ssh://me@box.example.com:2222",
		});
	});

	test("gives a null target for an address that is not valid", () => {
		const ssh = encodeURIComponent("ssh://-oProxyCommand=evil@box");
		expect(read(`/settings/hosts?ssh=${ssh}`)).toEqual({ target: null });
		expect(read("/settings/hosts?ssh=")).toEqual({ target: null });
	});

	test("ignores other links", () => {
		expect(read("/settings/hosts")).toBeNull();
		expect(read("/settings/hosts/abc?ssh=ssh%3A%2F%2Fme%40box")).toBeNull();
		expect(read("/new-workspace?ssh=ssh%3A%2F%2Fme%40box")).toBeNull();
	});
});
