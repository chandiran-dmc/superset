import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { env } from "renderer/env.renderer";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { electronReactClient } from "../../lib/trpc-client";

const WEB_QUERY_STALE_TIME_MS = 5_000;

// Shared QueryClient for tRPC hooks and router loaders
const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			networkMode: "always",
			retry: false,
			staleTime: env.DESKTOP_WEB_MODE ? WEB_QUERY_STALE_TIME_MS : 0,
			refetchOnWindowFocus: !env.DESKTOP_WEB_MODE,
			refetchOnReconnect: !env.DESKTOP_WEB_MODE,
		},
		mutations: {
			networkMode: "always",
			retry: false,
		},
	},
});

/**
 * Provider for Electron IPC tRPC client.
 * QueryClient is shared with router context for loader prefetching.
 */
export function ElectronTRPCProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<electronTrpc.Provider
			client={electronReactClient}
			queryClient={queryClient}
		>
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		</electronTrpc.Provider>
	);
}

// Export for router context
export { queryClient as electronQueryClient };
