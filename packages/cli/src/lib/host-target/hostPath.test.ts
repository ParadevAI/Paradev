import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { hostPath } from "./hostPath";
import type { ResolvedHostTarget } from "./resolveHostTarget";

const local = { kind: "local", hostId: "this" } as ResolvedHostTarget;
const remote = { kind: "remote", hostId: "other" } as ResolvedHostTarget;

describe("hostPath", () => {
	test("expands ~ and ~/x on this machine", () => {
		expect(hostPath(local, "~")).toBe(homedir());
		expect(hostPath(local, "~/x")).toBe(join(homedir(), "x"));
	});

	test("leaves ~user and ~ on another host alone", () => {
		expect(hostPath(local, "~user")).toBe(join(process.cwd(), "~user"));
		expect(() => hostPath(remote, "~/x")).toThrow("not an absolute path");
	});
});
