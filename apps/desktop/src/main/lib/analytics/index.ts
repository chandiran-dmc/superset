import { createRequire } from "node:module";
import { env } from "main/env.main";
import { outlit } from "main/lib/outlit";
import { PostHog } from "posthog-node";
import { toOutlitProperties } from "shared/analytics";
import { DEFAULT_TELEMETRY_ENABLED } from "shared/constants";

export let posthog: PostHog | null = null;
let userId: string | null = null;
const require = createRequire(import.meta.url);

function getDesktopVersion(): string {
	try {
		const electron = require("electron") as {
			app?: { getVersion: () => string };
		};
		if (electron?.app?.getVersion) {
			return electron.app.getVersion();
		}
	} catch {
		// Non-Electron runtime.
	}
	return "web";
}

function getClient(): PostHog | null {
	if (!env.NEXT_PUBLIC_POSTHOG_KEY) {
		return null;
	}

	if (!posthog) {
		posthog = new PostHog(env.NEXT_PUBLIC_POSTHOG_KEY, {
			host: env.NEXT_PUBLIC_POSTHOG_HOST,
			flushAt: 1,
			flushInterval: 0,
		});
	}
	return posthog;
}

function isTelemetryEnabled(): boolean {
	return DEFAULT_TELEMETRY_ENABLED;
}

export function setUserId(id: string | null): void {
	userId = id;
}

export function track(
	event: string,
	properties?: Record<string, unknown>,
): void {
	if (!userId) return;
	if (!isTelemetryEnabled()) return;

	const client = getClient();
	if (client) {
		client.capture({
			distinctId: userId,
			event,
			properties: {
				...properties,
				app_name: "desktop",
				platform: process.platform,
				desktop_version: getDesktopVersion(),
			},
		});
	}

	outlit.track({
		eventName: event,
		userId,
		properties: toOutlitProperties(properties),
	});

	// Fire user.activate() on project_opened (activation moment)
	if (event === "project_opened") {
		outlit.user.activate({ userId });
	}
}
