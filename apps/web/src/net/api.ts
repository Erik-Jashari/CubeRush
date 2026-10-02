import type {
  AllTimeLeaderboard,
  ApiErrorBody,
  AttemptDto,
  ChallengeDto,
  CreateAttemptRequest,
  DailyLeaderboard,
  GhostDto,
  MeResponse,
  RegisterResponse,
  SolveDto,
  SubmitSolveRequest,
} from '@cuberush/api';

export class ApiError extends Error {
  constructor(
    /** HTTP status, or 0 when the server could not be reached. */
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  token?: string | null;
  body?: unknown;
}

async function request<T>(method: 'GET' | 'POST', path: string, options: RequestOptions = {}) {
  const headers: Record<string, string> = {};
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['content-type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch {
    throw new ApiError(0, 'network', "Can't reach the CubeRush server.");
  }

  const data = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const error = data as Partial<ApiErrorBody> | null;
    throw new ApiError(
      res.status,
      error?.error ?? 'http_error',
      error?.message ?? `The server answered ${res.status}.`,
    );
  }
  return data as T;
}

export const api = {
  register: (nickname: string) =>
    request<RegisterResponse>('POST', '/players', { body: { nickname } }),
  me: (token: string) => request<MeResponse>('GET', '/me', { token }),
  createAttempt: (token: string, body: CreateAttemptRequest) =>
    request<AttemptDto>('POST', '/attempts', { token, body }),
  submitSolve: (token: string, body: SubmitSolveRequest) =>
    request<SolveDto>('POST', '/solves', { token, body }),
  dailyLeaderboard: (token: string | null) =>
    request<DailyLeaderboard>('GET', '/leaderboard/daily', { token }),
  allTimeLeaderboard: (token: string | null) =>
    request<AllTimeLeaderboard>('GET', '/leaderboard/all-time', { token }),
  createChallenge: (token: string, attemptId: string) =>
    request<{ code: string }>('POST', '/challenges', { token, body: { attemptId } }),
  challenge: (code: string) =>
    request<ChallengeDto>('GET', `/challenges/${encodeURIComponent(code)}`),
  dailyGhost: (token: string) => request<GhostDto>('GET', '/daily/ghost', { token }),
};
