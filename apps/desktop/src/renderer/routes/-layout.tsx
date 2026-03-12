import { Alerter } from "@superset/ui/atoms/Alert";
import type { ReactNode } from "react";
import { PostHogUserIdentifier } from "renderer/components/PostHogUserIdentifier";
import { TelemetrySync } from "renderer/components/TelemetrySync";
import { ThemedToaster } from "renderer/components/ThemedToaster";
import { env } from "renderer/env.renderer";
import { AuthProvider } from "renderer/providers/AuthProvider";
import { ElectronTRPCProvider } from "renderer/providers/ElectronTRPCProvider";
import { OutlitProvider } from "renderer/providers/OutlitProvider";
import { PostHogProvider } from "renderer/providers/PostHogProvider";

export function RootLayout({ children }: { children: ReactNode }) {
	if (env.DESKTOP_WEB_MODE || env.SKIP_ENV_VALIDATION) {
		return (
			<PostHogProvider>
				<ElectronTRPCProvider>
					<TelemetrySync />
					{children}
					<ThemedToaster />
					<Alerter />
				</ElectronTRPCProvider>
			</PostHogProvider>
		);
	}

	return (
		<PostHogProvider>
			<OutlitProvider>
				<ElectronTRPCProvider>
					<PostHogUserIdentifier />
					<TelemetrySync />
					<AuthProvider>
						{children}
						<ThemedToaster />
						<Alerter />
					</AuthProvider>
				</ElectronTRPCProvider>
			</OutlitProvider>
		</PostHogProvider>
	);
}
