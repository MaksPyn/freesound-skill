# Authentication and credential safety

Apply for an API credential at https://freesound.org/apiv2/apply/ while logged into Freesound. Freesound asks developers to use a different credential for every application.

## Token authentication

Token authentication covers ordinary read operations, including search, metadata, users, packs, similarity, analysis, and retrieval of preview URLs.

The CLI automatically reads the following user-level file:

```text
Windows: %APPDATA%\pi-freesound\credentials.env
Other:   ~/.config/pi-freesound/credentials.env
```

Example:

```env
FREESOUND_API_KEY=your-api-key
FREESOUND_OAUTH_ACCESS_TOKEN=
FREESOUND_USER_AGENT=Pi-Freesound-Skill/1.0
```

The file parser only accepts known `FREESOUND_*` settings and does not expand commands or variables. Existing process environment variables take precedence. Override the path through `FREESOUND_ENV_FILE` or `--credentials-file <path>`.

Credentials can also be configured directly as process environment variables:

```text
FREESOUND_API_KEY
```

The CLI sends:

```http
Authorization: Token <API key>
User-Agent: Pi-Freesound-Skill/1.0
```

A product integration can identify itself more specifically with `FREESOUND_USER_AGENT=ProductName/Version`.

Although Freesound also supports a `token` query parameter, this skill deliberately avoids it because URLs are commonly retained in logs, browser histories, proxies, and error reports.

## OAuth2 authentication

OAuth2 is required for original-quality sound downloads and account-changing operations. This skill only uses OAuth2 for original downloads and optional identity verification; it does not implement write operations.

Configure a current access token through:

```text
FREESOUND_OAUTH_ACCESS_TOKEN
```

The CLI sends:

```http
Authorization: Bearer <access token>
```

Never provide this token in chat or as a CLI argument.

## Freesound authorization-code flow

Freesound implements the OAuth2 authorization-code grant:

1. Redirect the user to `https://freesound.org/apiv2/oauth2/authorize/` with `client_id`, `response_type=code`, and preferably `state`.
2. Receive the authorization code through the registered redirect URL.
3. Exchange it by POSTing to `https://freesound.org/apiv2/oauth2/access_token/` with client ID, client secret, `grant_type=authorization_code`, and the code.
4. Use the returned bearer access token.
5. Refresh through the same access-token endpoint using `grant_type=refresh_token` and the newest refresh token.

Documented lifetimes:

- Authorization code: 10 minutes and single-use
- Access token: approximately 24 hours
- Refresh tokens can obtain replacement access and refresh tokens
- One active access token exists per application/user pair; creating another replaces the previous one

This skill does not persist client secrets or refresh tokens. Applications implementing the OAuth flow must use secure server-side storage, state validation, HTTPS redirects, and appropriate secret rotation.

## Status checks

```bash
node scripts/freesound.js auth status
```

Reports only whether each environment variable exists.

```bash
node scripts/freesound.js auth status --verify
```

Makes a minimal authenticated request. With OAuth, it calls `/me/`; with only an API key, it makes a one-result search. Secret values are never printed.

## Registration recovery

The registration error “You cannot use this email address to create an account” means an account already exists for that email, possibly inactive. Use Freesound's login-problem, username recovery, password reset, or reactivation flow. If recovery fails, use https://freesound.org/help/contact/.

## Security requirements

- Keep the credentials file outside the skill and repositories; never commit it or token responses.
- Never pass secrets as CLI arguments.
- Do not reuse one application key across unrelated products.
- Revoke and replace compromised credentials.
- Protect Freesound user identifiers and account data obtained through OAuth.
- Report credential/data breaches to Freesound according to its API security terms.
