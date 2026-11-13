import { beforeEach, describe, expect, test } from "bun:test";
import { useComposerDraftsStore } from "./composerDraftsStore";

const KEY = "workspace:test";

const uploads = () =>
	useComposerDraftsStore.getState().draftsByKey[KEY]?.uploads;

beforeEach(() => {
	useComposerDraftsStore.setState({ draftsByKey: {} });
});

describe("composerDraftsStore uploads", () => {
	// SUPER-3442: a host workspace never uploads at attach time, so a seeded
	// entry stayed at 0% and the composer refused to send.
	test("adding an attachment records no upload until one begins", () => {
		useComposerDraftsStore
			.getState()
			.addAttachments(KEY, [{ id: "a", type: "image", uri: "file:///a.jpg" }]);

		expect(uploads()).toEqual({});
	});

	test("beginUpload starts tracking an attachment the draft holds", () => {
		const store = useComposerDraftsStore.getState();
		store.addAttachments(KEY, [
			{ id: "a", type: "image", uri: "file:///a.jpg" },
		]);
		store.beginUpload(KEY, "a");

		expect(uploads()).toEqual({
			a: { progress: 0, fileId: undefined, error: undefined },
		});
	});
});
