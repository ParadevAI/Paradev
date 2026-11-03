import { expect, test } from "bun:test";
import { sidebarHostIsOnline } from "./sidebarHostIsOnline";

test("a host is offline only once its connection has resolved without opening", () => {
	expect(sidebarHostIsOnline(undefined)).toBeNull();
	expect(
		sidebarHostIsOnline({ isOnline: false, isConnecting: true }),
	).toBeNull();
	expect(sidebarHostIsOnline({ isOnline: false, isConnecting: false })).toBe(
		false,
	);
	expect(sidebarHostIsOnline({ isOnline: true, isConnecting: false })).toBe(
		true,
	);
});
