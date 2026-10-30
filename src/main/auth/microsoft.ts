import { postForm, postJson, fetchJson } from '../http';
import { getSettings } from '../store';
import { broadcast } from '../tasks';
import type { Account } from '../../shared/types';

/**
 * Azure AD public client id. The user can (and should) register their own app
 * at https://portal.azure.com (mobile/desktop app, "Allow public client flows")
 * and set it in the launcher settings — required for Microsoft login to work.
 */
const DEFAULT_CLIENT_ID = '00000000-0000-0000-0000-000000000000';

const DEVICE_CODE_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode';
const TOKEN_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
const SCOPE = 'XboxLive.signin offline_access';

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
  message: string;
  error?: string;
  error_description?: string;
}
interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}
interface XblResponse {
  Token: string;
  DisplayClaims: { xui: { uhs: string; xid?: string }[] };
}
interface McLoginResponse {
  access_token: string;
  expires_in: number;
}
interface McProfile {
  id: string;
  name: string;
  error?: string;
}

async function clientId(): Promise<string> {
  const s = await getSettings();
  return s.msClientId?.trim() || DEFAULT_CLIENT_ID;
}

/** Exchange an MSA access token for a Minecraft token + profile. */
async function msaToMinecraft(msAccessToken: string): Promise<{ token: string; expiresAt: number; profile: McProfile; xuid: string }> {
  const xbl = await postJson<XblResponse>('https://user.auth.xboxlive.com/user/authenticate', {
    Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: `d=${msAccessToken}` },
    RelyingParty: 'http://auth.xboxlive.com',
    TokenType: 'JWT'
  });
  const xsts = await postJson<XblResponse>('https://xsts.auth.xboxlive.com/xsts/authorize', {
    Properties: { SandboxId: 'RETAIL', UserTokens: [xbl.Token] },
    RelyingParty: 'rp://api.minecraftservices.com/',
    TokenType: 'JWT'
  }).catch((e: Error) => {
    if (e.message.includes('2148916233')) throw new Error('Esta conta Microsoft não tem perfil Xbox. Cria um em xbox.com.');
    if (e.message.includes('2148916238')) throw new Error('Conta de menor: precisa de ser adicionada a uma família Microsoft.');
    throw e;
  });
  const uhs = xsts.DisplayClaims.xui[0].uhs;
  const xuid = xsts.DisplayClaims.xui[0].xid ?? '';
  const mc = await postJson<McLoginResponse>('https://api.minecraftservices.com/authentication/login_with_xbox', {
    identityToken: `XBL3.0 x=${uhs};${xsts.Token}`
  });
  const profile = await fetchJson<McProfile>('https://api.minecraftservices.com/minecraft/profile', {
    Authorization: `Bearer ${mc.access_token}`
  });
  if (!profile.id) throw new Error('Esta conta Microsoft não possui o Minecraft: Java Edition.');
  return { token: mc.access_token, expiresAt: Date.now() + mc.expires_in * 1000, profile, xuid };
}

/**
 * Full device-code login. Emits 'auth:device' with the code to show the user,
 * then polls until completion. Returns the ready-to-use Account.
 */
export async function loginWithDeviceCode(): Promise<Account> {
  const cid = await clientId();
  const dc = await postForm<DeviceCodeResponse>(DEVICE_CODE_URL, { client_id: cid, scope: SCOPE });
  if (dc.error || !dc.device_code) {
    throw new Error(
      `Falha ao iniciar login Microsoft (${dc.error ?? 'sem device_code'}). ` +
        'Configura um Client ID válido da Azure nas Definições.'
    );
  }
  broadcast('auth:device', {
    userCode: dc.user_code,
    verificationUri: dc.verification_uri,
    message: dc.message
  });

  const deadline = Date.now() + dc.expires_in * 1000;
  const intervalMs = Math.max(dc.interval ?? 5, 1) * 1000;
  let token: TokenResponse | null = null;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const res = await postForm<TokenResponse>(TOKEN_URL, {
      client_id: cid,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: dc.device_code
    });
    if (res.access_token) {
      token = res;
      break;
    }
    if (res.error && res.error !== 'authorization_pending' && res.error !== 'slow_down') {
      throw new Error(`Login Microsoft falhou: ${res.error_description ?? res.error}`);
    }
  }
  if (!token?.access_token) throw new Error('Login Microsoft expirou. Tenta novamente.');

  const mc = await msaToMinecraft(token.access_token);
  return {
    id: mc.profile.id,
    type: 'microsoft',
    username: mc.profile.name,
    uuid: mc.profile.id,
    accessToken: mc.token,
    refreshToken: token.refresh_token,
    expiresAt: mc.expiresAt
  };
}

/** Refresh an expired Microsoft account (used transparently at launch). */
export async function refreshAccount(account: Account): Promise<Account> {
  if (!account.refreshToken) throw new Error('Sessão expirada — volta a iniciar sessão.');
  const cid = await clientId();
  const res = await postForm<TokenResponse>(TOKEN_URL, {
    client_id: cid,
    grant_type: 'refresh_token',
    refresh_token: account.refreshToken,
    scope: SCOPE
  });
  if (!res.access_token) throw new Error(`Falha ao renovar sessão: ${res.error_description ?? res.error}`);
  const mc = await msaToMinecraft(res.access_token);
  return {
    ...account,
    username: mc.profile.name,
    uuid: mc.profile.id,
    accessToken: mc.token,
    refreshToken: res.refresh_token ?? account.refreshToken,
    expiresAt: mc.expiresAt
  };
}
