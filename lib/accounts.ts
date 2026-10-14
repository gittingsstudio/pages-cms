/**
 * Get the list of GitHub accounts the user (incl. collaborators) has access to.
 */

import { db } from "@/db";
import { collaboratorTable } from "@/db/schema";
import { getInstallations } from "@/lib/github-app";
import { User } from "@/types/user";
import { getGithubAccount } from "@/lib/github-account";
import { requireGithubUserToken } from "@/lib/authz-server";
import { hasGithubIdentity } from "@/lib/authz-shared";
import { collaboratorMatchesUser } from "@/lib/collaborator-access";

// The installations are listed on every page load, we keep them in memory for a minute
// (per user). They only drive the list of accounts, not access to repositories.
const INSTALLATIONS_TTL_MS = 60 * 1000;
const installationsCache = new Map<string, { expiresAt: number; value: Promise<any[]> }>();

const getUserInstallations = (userId: string, token: string) => {
  const now = Date.now();
  const cached = installationsCache.get(userId);
  if (cached && cached.expiresAt > now) return cached.value;

  installationsCache.forEach((item, key) => {
    if (item.expiresAt <= now) installationsCache.delete(key);
  });

  const value = getInstallations(token);
  installationsCache.set(userId, { expiresAt: now + INSTALLATIONS_TTL_MS, value });
  value.catch(() => {
    if (installationsCache.get(userId)?.value === value) installationsCache.delete(userId);
  });
  return value;
};

const getAccounts = async (user: User) => {
	let accounts: Array<{
    login: string;
    type: string;
    repositorySelection: string;
    installationId: number;
  }> = [];
  const githubAccount = await getGithubAccount(user.id);

	if (githubAccount?.accessToken && hasGithubIdentity(user)) {
		const token = await requireGithubUserToken(user);
		
		const installations = await getUserInstallations(user.id, token);

		accounts = [
			...installations.map((installation: any) => ({
				login: installation.account.login,
				type: installation.account.type === "User" ? "user" : "org",
				repositorySelection: installation.repository_selection,
        installationId: installation.id
			}))
		];
	}

  const groupedRepos = await db
    .selectDistinct({
      owner: collaboratorTable.owner,
      type: collaboratorTable.type,
      installationId: collaboratorTable.installationId
    })
    .from(collaboratorTable)
    .where(collaboratorMatchesUser(user));

  const collaboratorAccounts = groupedRepos.map(collaborator => ({
    login: collaborator.owner,
    type: collaborator.type,
    repositorySelection: "selected",
    installationId: collaborator.installationId
  }));

  const dedupedAccounts = new Map<string, (typeof accounts)[number]>();

  for (const account of accounts) {
    const key = `${account.login.toLowerCase()}::${account.installationId}`;
    dedupedAccounts.set(key, account);
  }

  for (const account of collaboratorAccounts) {
    const key = `${account.login.toLowerCase()}::${account.installationId}`;
    if (!dedupedAccounts.has(key)) {
      dedupedAccounts.set(key, account);
    }
  }

  accounts = Array.from(dedupedAccounts.values());

	if (accounts.length === 0) return [];

  return accounts;
};

export { getAccounts };
