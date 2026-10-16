/**
 * Stands in for renderer/lib/clickPolicy under Storybook. Everything is the
 * real barrel except the link action, which reads the signed-in user's
 * preferences through the collections provider no story mounts; stories open
 * every link externally.
 */
export * from "../../src/renderer/lib/clickPolicy/index";

export function useUrlLinkAction() {
	return () => "external" as const;
}
