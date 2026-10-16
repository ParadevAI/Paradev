import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { NoteDialog } from "./NoteDialog";

const meta = {
	component: NoteDialog,
	args: { note: "", response: null, onSend: fn(), onCancel: fn() },
} satisfies Meta<typeof NoteDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

/** The agent drafted the note and the reader already said yes. */
export const Drafted: Story = {
	args: {
		note: "I'll be ten minutes late, coming from the dentist.",
		response: "accepted",
	},
};
