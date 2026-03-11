import { OutlitProvider as OutlitBrowserProvider } from "@outlit/browser/react";
import type React from "react";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { outlit, outlitEnabled } from "renderer/lib/outlit";

interface OutlitProviderProps {
	children: React.ReactNode;
}

export function OutlitProvider({ children }: OutlitProviderProps) {
	if (!outlitEnabled) {
		return <>{children}</>;
	}

	if (env.DESKTOP_WEB_MODE) {
		return (
			<OutlitBrowserProvider client={outlit} user={null}>
				{children}
			</OutlitBrowserProvider>
		);
	}

	return <OutlitProviderWithAuth>{children}</OutlitProviderWithAuth>;
}

function OutlitProviderWithAuth({ children }: OutlitProviderProps) {
	const { data: session } = authClient.useSession();
	const user = session?.user;

	return (
		<OutlitBrowserProvider
			client={outlit}
			user={
				user
					? {
							email: user.email,
							userId: user.id,
							traits: { name: user.name },
						}
					: null
			}
		>
			{children}
		</OutlitBrowserProvider>
	);
}
