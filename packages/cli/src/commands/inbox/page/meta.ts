export default {
	description:
		"The block document behind a card: whole-document writes, versioned, with integration cards and questions the person answers in place. Superset cards an agent can place: superset.agent_finished {workspace, agent?} when its work is ready to review, so the person can send feedback back into this session; superset.agent_needs {need: credential|tool|question, workspace?, service?, scope?, tool?, question?} when it is blocked on an account, a risky tool or a question (question is the id of an ask question in the same document). workspace is $SUPERSET_WORKSPACE_ID; the host defaults to the machine that pushed the card",
};
