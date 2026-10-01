import { createHttpError } from "@/lib/api-error";
import { getConfig } from "@/lib/config-store";
import { getGithubId } from "@/lib/github-account";
import { checkRepoAccess } from "@/lib/github-cache-permissions";
import { requireApiUserSession } from "@/lib/session-server";
import { getToken } from "@/lib/token";
import type { Config } from "@/types/config";
import type { User } from "@/types/user";

type RepoRef = {
  owner: string;
  repo: string;
  branch: string;
};

type RepoReadContext = {
  user: User;
  token: string;
  config: Config;
};

const resolveRepoAccess = async (user: User, { owner, repo, branch }: RepoRef) => {
  const { token, source } = await getToken(user, owner, repo);
  if (!token) throw createHttpError("Token not found", 401);

  const githubId = await getGithubId(user.id);
  if (githubId && source === "user") {
    const hasAccess = await checkRepoAccess(token, owner, repo, githubId);
    if (!hasAccess) throw createHttpError(`No access to repository ${owner}/${repo}.`, 403);
  }

  const config = await getConfig(owner, repo, branch, {
    getToken: async () => token,
  });
  if (!config) throw createHttpError(`Configuration not found for ${owner}/${repo}/${branch}.`, 404);

  return { token, config };
};

const requireUser = async () => {
  const sessionResult = await requireApiUserSession();
  if ("response" in sessionResult) {
    throw createHttpError("Not signed in.", sessionResult.response?.status ?? 401);
  }

  return sessionResult.user as User;
};

const getRepoReadContext = async (ref: RepoRef): Promise<RepoReadContext> => {
  const user = await requireUser();
  return { user, ...(await resolveRepoAccess(user, ref)) };
};

const REPO_ACCESS_TTL_MS = 60_000;
const repoAccessCache = new Map<string, { expiresAt: number; value: ReturnType<typeof resolveRepoAccess> }>();

// Same as getRepoReadContext, but the token, access check and config are kept in memory
// for a minute (per user and branch). Meant for routes hit in bursts (e.g. images), where
// resolving them again for each request is most of the work. The session is still
// checked on every request.
const getCachedRepoReadContext = async (ref: RepoRef): Promise<RepoReadContext> => {
  const user = await requireUser();

  const now = Date.now();
  const key = `${user.id}::${ref.owner.toLowerCase()}::${ref.repo.toLowerCase()}::${ref.branch}`;
  let entry = repoAccessCache.get(key);

  if (!entry || entry.expiresAt <= now) {
    repoAccessCache.forEach((item, itemKey) => {
      if (item.expiresAt <= now) repoAccessCache.delete(itemKey);
    });

    const value = resolveRepoAccess(user, ref);
    entry = { expiresAt: now + REPO_ACCESS_TTL_MS, value };
    repoAccessCache.set(key, entry);
    value.catch(() => {
      if (repoAccessCache.get(key)?.value === value) repoAccessCache.delete(key);
    });
  }

  return { user, ...(await entry.value) };
};

export { getRepoReadContext, getCachedRepoReadContext };
