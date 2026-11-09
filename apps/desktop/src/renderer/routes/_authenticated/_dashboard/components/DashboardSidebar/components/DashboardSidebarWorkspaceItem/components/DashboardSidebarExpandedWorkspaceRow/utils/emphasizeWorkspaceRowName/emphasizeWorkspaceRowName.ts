interface EmphasizeWorkspaceRowNameArgs {
	/** Unread, or an agent waiting on an answer, from the status provider. */
	needsAttention: boolean;
	isActive: boolean;
	isSelected: boolean;
	isCreatePending: boolean;
}

/**
 * Whether the row's name renders emphasized. The open row is already
 * acknowledged by being open, and a row still being created has nothing to
 * report yet.
 */
export function emphasizeWorkspaceRowName({
	needsAttention,
	isActive,
	isSelected,
	isCreatePending,
}: EmphasizeWorkspaceRowNameArgs): boolean {
	if (isActive || isSelected || isCreatePending) return false;
	return needsAttention;
}
