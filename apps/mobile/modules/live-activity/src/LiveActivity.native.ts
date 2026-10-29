import { requireNativeModule } from "expo";
import type { LiveActivityModule } from "./LiveActivity.types";

export default requireNativeModule<LiveActivityModule>("LiveActivity");
