import { createContext, type ReactNode, useContext, useMemo } from "react";
import type { SlackPersonView } from "../../components/SlackMessage/types";

/** Someone a message names: the full profile when the card has it, the name otherwise. */
export type SlackPerson = Pick<SlackPersonView, "id" | "name"> &
	Partial<SlackPersonView>;

export interface SlackWorkspace {
	people: ReadonlyMap<string, SlackPerson>;
	/** Channel id to name, without the `#`. */
	channels: Readonly<Record<string, string>>;
	/** User-group id to handle, without the `@`. */
	groups: Readonly<Record<string, string>>;
	/** Custom emoji name to image url. */
	emoji: Readonly<Record<string, string>>;
	/** The workspace's own address, `https://acme.slack.com`. */
	workspaceUrl: string | null;
}

const EMPTY: SlackWorkspace = {
	people: new Map(),
	channels: {},
	groups: {},
	emoji: {},
	workspaceUrl: null,
};

const SlackWorkspaceContext = createContext<SlackWorkspace>(EMPTY);

interface SlackWorkspaceProviderProps {
	people?: SlackPerson[];
	names?: Readonly<Record<string, string>>;
	channels?: Readonly<Record<string, string>>;
	groups?: Readonly<Record<string, string>>;
	emoji?: Readonly<Record<string, string>>;
	workspaceUrl?: string | null;
	children: ReactNode;
}

/** Who and what a thread's messages can name, for everything drawn inside it. */
export function SlackWorkspaceProvider({
	people = [],
	names = {},
	channels = EMPTY.channels,
	groups = EMPTY.groups,
	emoji = EMPTY.emoji,
	workspaceUrl = null,
	children,
}: SlackWorkspaceProviderProps) {
	const value = useMemo<SlackWorkspace>(() => {
		const byId = new Map<string, SlackPerson>(
			Object.entries(names).map(([id, name]) => [id, { id, name }]),
		);
		for (const person of people) {
			byId.set(person.id, { ...byId.get(person.id), ...person });
		}
		return { people: byId, channels, groups, emoji, workspaceUrl };
	}, [people, names, channels, groups, emoji, workspaceUrl]);
	return (
		<SlackWorkspaceContext.Provider value={value}>
			{children}
		</SlackWorkspaceContext.Provider>
	);
}

export function useSlackWorkspace(): SlackWorkspace {
	return useContext(SlackWorkspaceContext);
}
