import "server-only";

import type { PreviewDeploy, PreviewDeployState } from "@/lib/preview";

/**
 * Reads deploy status from the Netlify API.
 *
 * Needs NETLIFY_AUTH_TOKEN (a personal access token). Set NETLIFY_ALLOWED_SITES
 * to a comma-separated list of site names or IDs to stop repositories from
 * reading deploys of other sites that token can see.
 */

const NETLIFY_API = "https://api.netlify.com/api/v1";

const getNetlifyToken = () => process.env.NETLIFY_AUTH_TOKEN?.trim() || null;

const normalizeSiteId = (site: string) => {
  const trimmed = site.trim().toLowerCase();
  // Accept "my-site", "my-site.netlify.app" or a site ID.
  return trimmed.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
};

const isNetlifySiteAllowed = (site: string) => {
  const allowList = process.env.NETLIFY_ALLOWED_SITES?.trim();
  if (!allowList) return true;
  const normalized = normalizeSiteId(site);
  const bareName = normalized.replace(/\.netlify\.app$/, "");
  return allowList
    .split(",")
    .map((entry) => normalizeSiteId(entry))
    .filter(Boolean)
    .some((entry) => entry === normalized || entry === bareName || entry.replace(/\.netlify\.app$/, "") === bareName);
};

// The API takes a site ID or a full domain, so "my-site" becomes "my-site.netlify.app".
const toApiSiteId = (site: string) => {
  const normalized = normalizeSiteId(site);
  if (normalized.includes(".")) return normalized;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(normalized)) return normalized;
  return `${normalized}.netlify.app`;
};

const mapDeployState = (state: string | null | undefined): PreviewDeployState => {
  switch (state) {
    case "ready":
      return "ready";
    case "error":
    case "rejected":
      return "error";
    case "new":
    case "pending_review":
    case "accepted":
    case "enqueued":
    case "building":
    case "uploading":
    case "uploaded":
    case "preparing":
    case "prepared":
    case "processing":
    case "processed":
      return "building";
    default:
      return "unknown";
  }
};

const netlifyFetch = async (path: string, token: string) => {
  const response = await fetch(`${NETLIFY_API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "PagesCMS",
    },
    cache: "no-store",
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Netlify API request failed (${response.status}).`);
  }
  return response.json();
};

const pickDeployUrl = (deploy: any, site: any): string | null => {
  if (deploy?.context === "production") {
    return site?.ssl_url || site?.url || deploy?.ssl_url || null;
  }
  return deploy?.links?.branch
    || deploy?.links?.alias
    || deploy?.deploy_ssl_url
    || deploy?.deploy_url
    || null;
};

const getLatestNetlifyDeploy = async (
  site: string,
  branch: string,
): Promise<{ deploy: PreviewDeploy | null; siteUrl: string | null }> => {
  const token = getNetlifyToken();
  if (!token) {
    throw new Error("Netlify status needs NETLIFY_AUTH_TOKEN on the server.");
  }
  if (!isNetlifySiteAllowed(site)) {
    throw new Error(`Netlify site "${site}" is not in NETLIFY_ALLOWED_SITES.`);
  }

  const siteId = toApiSiteId(site);
  const siteData = await netlifyFetch(`/sites/${encodeURIComponent(siteId)}`, token);
  if (!siteData) throw new Error(`Netlify site "${site}" not found.`);

  const deploys = await netlifyFetch(
    `/sites/${encodeURIComponent(siteData.id ?? siteId)}/deploys?branch=${encodeURIComponent(branch)}&per_page=1`,
    token,
  );
  const latest = Array.isArray(deploys) ? deploys[0] : null;

  const isProductionBranch = siteData?.build_settings?.repo_branch === branch;
  const siteUrl = isProductionBranch ? (siteData.ssl_url || siteData.url || null) : null;

  if (!latest) return { deploy: null, siteUrl };

  return {
    siteUrl,
    deploy: {
      state: mapDeployState(latest.state),
      rawState: latest.state ?? null,
      context: latest.context ?? null,
      commitRef: latest.commit_ref ?? null,
      url: pickDeployUrl(latest, siteData),
      createdAt: latest.created_at ?? null,
      publishedAt: latest.published_at ?? null,
      errorMessage: latest.error_message ?? null,
      adminUrl: siteData.admin_url && latest.id
        ? `${siteData.admin_url}/deploys/${latest.id}`
        : null,
    },
  };
};

export { getLatestNetlifyDeploy, getNetlifyToken };
