import { mock } from "bun:test";

// Lingui macros are compile-time; bun test runs uncompiled source.
type MessageDescriptor = {
	id?: string;
	message?: string;
	values?: Record<string, unknown>;
};

const renderMessage = (descriptor: MessageDescriptor): string => {
	let text = descriptor.message ?? descriptor.id ?? "";
	for (const [key, value] of Object.entries(descriptor.values ?? {})) {
		text = text.replaceAll(`{${key}}`, String(value));
	}
	return text;
};

const pickPluralBranch = (
	value: number,
	branches: Record<string, unknown>,
): unknown => {
	const branch =
		value === 1 && branches.one !== undefined ? branches.one : branches.other;
	return typeof branch === "string"
		? branch.replaceAll("#", String(value))
		: branch;
};

mock.module("@lingui/react/macro", () => ({
	Trans: ({ children }: { children?: unknown }) => children,
	Plural: ({ value, ...branches }: { value: number }) =>
		pickPluralBranch(value, branches),
	useLingui: () => ({
		t: (descriptor: MessageDescriptor) => renderMessage(descriptor),
		i18n: { _: (descriptor: MessageDescriptor) => renderMessage(descriptor) },
	}),
}));

mock.module("@lingui/core/macro", () => ({
	msg: (descriptor: MessageDescriptor) => descriptor,
	t: (descriptor: MessageDescriptor) => renderMessage(descriptor),
	plural: (value: number, branches: Record<string, string>) =>
		String(pickPluralBranch(value, branches)),
}));
