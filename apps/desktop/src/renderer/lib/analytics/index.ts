import { outlit, outlitEnabled } from "renderer/lib/outlit";
import { posthog } from "renderer/lib/posthog";
import { toOutlitProperties } from "shared/analytics";

export function track(
	event: string,
	properties?: Record<string, unknown>,
): void {
	posthog.capture(event, properties);
	if (outlitEnabled) {
		outlit.track(event, toOutlitProperties(properties));
	}
}
