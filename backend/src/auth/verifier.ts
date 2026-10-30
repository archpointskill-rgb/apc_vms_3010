import { createRemoteJWKSet, jwtVerify } from "jose";

export interface VerifiedToken {
  sub: string;
  email?: string;
}

export interface TokenVerifier {
  verify(token: string): Promise<VerifiedToken>;
}

/**
 * Checks the access token Supabase Auth gave the browser.
 *
 * New projects sign with a rotating key pair, which is verified offline against
 * the project's published keys. Older projects sign with a shared secret, which
 * cannot be checked offline, so the token is confirmed with Supabase once and
 * the answer cached briefly. Either way no extra secret has to be configured.
 */
export class SupabaseVerifier implements TokenVerifier {
  private readonly jwks;
  private readonly cache = new Map<string, { value: VerifiedToken; until: number }>();
  private readonly cacheMs = 60_000;

  constructor(private readonly url: string, private readonly apiKey: string) {
    this.jwks = createRemoteJWKSet(new URL(`${url}/auth/v1/.well-known/jwks.json`));
  }

  async verify(token: string): Promise<VerifiedToken> {
    const cached = this.cache.get(token);
    if (cached && cached.until > Date.now()) return cached.value;

    let result: VerifiedToken;
    try {
      const { payload } = await jwtVerify(token, this.jwks, { issuer: `${this.url}/auth/v1` });
      if (!payload.sub) throw new Error("The token names no user.");
      result = { sub: payload.sub, email: typeof payload.email === "string" ? payload.email : undefined };
    } catch {
      result = await this.askSupabase(token);
    }
    this.cache.set(token, { value: result, until: Date.now() + this.cacheMs });
    if (this.cache.size > 500) this.cache.clear();
    return result;
  }

  private async askSupabase(token: string): Promise<VerifiedToken> {
    const res = await fetch(`${this.url}/auth/v1/user`, {
      headers: { apikey: this.apiKey, Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error("That sign-in is not valid.");
    const user = (await res.json()) as { id?: string; email?: string };
    if (!user.id) throw new Error("That sign-in is not valid.");
    return { sub: user.id, email: user.email };
  }
}
