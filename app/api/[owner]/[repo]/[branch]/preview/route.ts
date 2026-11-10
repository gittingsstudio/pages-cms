import { getConfig } from "@/lib/config-store";
import { getToken } from "@/lib/token";
import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { requireApiUserSession } from "@/lib/session-server";
import { getPreviewRootConfig, resolvePreviewBaseUrl, type PreviewStatus } from "@/lib/preview";
import { getLatestNetlifyDeploy } from "@/lib/netlify";

/**
 * Returns the deploy status of the branch's preview site.
 *
 * GET /api/[owner]/[repo]/[branch]/preview
 *
 * Requires authentication and `preview.netlify.site` in the configuration.
 */

export async function GET(
  _request: Request,
  context: { params: Promise<{ owner: string; repo: string; branch: string }> },
) {
  try {
    const params = await context.params;
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;
    const user = sessionResult.user;

    const { token } = await getToken(user, params.owner, params.repo);
    if (!token) throw createHttpError("Token not found", 401);

    const config = await getConfig(params.owner, params.repo, params.branch, {
      getToken: async () => token,
    });
    if (!config) throw createHttpError(`Configuration not found for ${params.owner}/${params.repo}/${params.branch}.`, 404);

    const previewConfig = getPreviewRootConfig(config.object);
    const site = previewConfig?.netlify?.site;
    if (!site) throw createHttpError("No Netlify site is set in 'preview.netlify.site'.", 400);

    const { deploy, siteUrl } = await getLatestNetlifyDeploy(site, params.branch);

    const data: PreviewStatus = {
      provider: "netlify",
      baseUrl: resolvePreviewBaseUrl(config.object, params.branch, siteUrl ?? deploy?.url ?? null),
      deploy,
    };

    return Response.json({ status: "success", data });
  } catch (error: any) {
    console.error(error);
    return toErrorResponse(error);
  }
}
