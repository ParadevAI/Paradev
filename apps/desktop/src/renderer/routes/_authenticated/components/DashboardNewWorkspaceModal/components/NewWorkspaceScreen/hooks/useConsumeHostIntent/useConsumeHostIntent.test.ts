import { afterEach, expect, mock, test } from "bun:test";

const { cleanup, renderHook } = await import("@testing-library/react");
const { useConsumeHostIntent } = await import("./useConsumeHostIntent");

afterEach(cleanup);

test("a host in the URL is saved and removed, so a later navigation without one keeps it", () => {
	let saved: string | null = "mac";
	const saveHost = mock((hostId: string) => {
		saved = hostId;
	});
	const clearIntent = mock();
	const { rerender } = renderHook(
		({ intentHostId }: { intentHostId: string | null }) =>
			useConsumeHostIntent({
				isOpen: true,
				intentHostId,
				saveHost,
				clearIntent,
			}),
		{ initialProps: { intentHostId: "cloud" as string | null } },
	);
	expect(saved).toBe("cloud");
	expect(clearIntent).toHaveBeenCalledTimes(1);

	rerender({ intentHostId: null });
	expect(saved).toBe("cloud");
	expect(saveHost).toHaveBeenCalledTimes(1);
});

test("nothing happens while the screen is closed", () => {
	const saveHost = mock();
	renderHook(() =>
		useConsumeHostIntent({
			isOpen: false,
			intentHostId: "cloud",
			saveHost,
			clearIntent: mock(),
		}),
	);
	expect(saveHost).not.toHaveBeenCalled();
});
