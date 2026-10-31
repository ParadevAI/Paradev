/**
 * Asks the system, at most once per install, to let the agent card show.
 * Resolves whether it may show now. Never throws.
 */
export type RequestCardPermission = () => Promise<boolean>;
