/**
 * Shopify OAuth client credentials grant.
 * Exchanges a client ID + secret for a short-lived access token (24h).
 * See: https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/client-credentials-grant
 */

export interface ShopifyTokenResponse {
  accessToken: string;
  scope: string;
  expiresIn: number;
}

/**
 * Exchange client credentials for a Shopify access token.
 * Uses the client_credentials grant type — designed for server-to-server integrations.
 */
export async function exchangeForToken(
  shopDomain: string,
  clientId: string,
  clientSecret: string,
): Promise<ShopifyTokenResponse> {
  const store = shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const url = `https://${store}/admin/oauth/access_token`;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Shopify token exchange failed (${response.status}): ${text}`,
    );
  }

  const data = await response.json() as {
    access_token: string;
    scope: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    scope: data.scope,
    expiresIn: data.expires_in,
  };
}
