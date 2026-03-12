import { stripeClient } from "@better-auth/stripe/client";
import type { auth } from "@superset/auth/server";
import {
	apiKeyClient,
	customSessionClient,
	jwtClient,
	organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { env } from "renderer/env.renderer";
import { MOCK_ORG_ID } from "shared/constants";

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
	authToken = token;
}

export function getAuthToken(): string | null {
	return authToken;
}

let jwt: string | null = null;

export function setJwt(token: string | null) {
	jwt = token;
}

export function getJwt(): string | null {
	return jwt;
}

/**
 * Better Auth client for Electron desktop app.
 *
 * Bearer authentication configured via onRequest hook.
 * Server has bearer() plugin enabled to accept bearer tokens.
 */
const cloudAuthClient = createAuthClient({
	baseURL: env.NEXT_PUBLIC_API_URL,
	plugins: [
		organizationClient(),
		customSessionClient<typeof auth>(),
		stripeClient({ subscription: true }),
		apiKeyClient(),
		jwtClient(),
	],
	fetchOptions: {
		credentials: "include",
		onRequest: async (context) => {
			const token = getAuthToken();
			if (token) {
				context.headers.set("Authorization", `Bearer ${token}`);
			}
		},
		onResponse: async (context) => {
			const token = context.response.headers.get("set-auth-jwt");
			if (token) {
				setJwt(token);
			}
		},
	},
});

const WEB_USER_ID = "local-user";

const webSessionData = {
	user: {
		id: WEB_USER_ID,
		name: "Local User",
		email: "local@localhost",
		image: null,
	},
	session: {
		id: "local-session",
		userId: WEB_USER_ID,
		activeOrganizationId: MOCK_ORG_ID,
	},
};

const webActiveOrganizationData = {
	id: MOCK_ORG_ID,
	name: "Local",
	slug: "local",
	logo: null,
	metadata: null,
	members: [
		{
			id: "local-member",
			organizationId: MOCK_ORG_ID,
			userId: WEB_USER_ID,
			role: "owner",
			createdAt: new Date(0),
		},
	],
};

const webAuthClient = {
	...cloudAuthClient,
	useSession: () =>
		({
			data: webSessionData,
			error: null,
			isPending: false,
			isRefetching: false,
			refetch: async () => ({ data: webSessionData, error: null }),
		}) as unknown as ReturnType<typeof cloudAuthClient.useSession>,
	useActiveOrganization: () =>
		({
			data: webActiveOrganizationData,
			error: null,
			isPending: false,
			isRefetching: false,
			refetch: async () => ({ data: webActiveOrganizationData, error: null }),
		}) as unknown as ReturnType<typeof cloudAuthClient.useActiveOrganization>,
} as typeof cloudAuthClient;

export const authClient =
	env.DESKTOP_WEB_MODE || env.SKIP_ENV_VALIDATION
		? webAuthClient
		: cloudAuthClient;
