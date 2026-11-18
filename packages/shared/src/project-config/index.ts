export {
	LEGACY_PROJECT_CONFIG_DIR,
	PROJECT_CONFIG_DIR,
	PROJECT_CONFIG_FILE,
	PROJECT_LOCAL_CONFIG_FILE,
} from "./constants";
export {
	type ConfigError,
	type ParseProjectConfigResult,
	parseProjectConfig,
} from "./parse";
export {
	getDefaultTerminal,
	type ResolvedPhase,
	type ResolvedPort,
	type ResolvedProjectConfig,
	type ResolvedTerminal,
	resolveProjectConfig,
} from "./resolve";
export {
	CONFIG_NAME_PATTERN,
	type ConfigEnvironment,
	MAX_PREVIEW_PORTS,
	type PhaseName,
	type ProjectConfig,
	projectConfigSchema,
} from "./schema";
export { fromV1Json, toTomlText } from "./v1";
