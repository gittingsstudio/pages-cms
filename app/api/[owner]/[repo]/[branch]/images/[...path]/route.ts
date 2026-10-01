import sharp from "sharp";
import { getCachedRepoReadContext } from "@/lib/api-repo-context";
import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { imageWidths } from "@/lib/github-image";
import { extensionCategories, getFileExtension, normalizePath } from "@/lib/utils/file";

/**
 * Serve an image from a GitHub repository, optionally resized. Every image displayed in
 * the app goes through this route, so the browser never needs GitHub's short-lived
 * signed URLs (required for private repositories) or the full-size originals.
 *
 * GET /api/[owner]/[repo]/[branch]/images/[...path]?w=[width]&v=[sha]
 *
 * Requires authentication.
 */

const MAX_SOURCE_BYTES = 40 * 1024 * 1024;

const passthroughTypes: Record<string, string> = {
  svg: "image/svg+xml",
  ico: "image/x-icon",
  bmp: "image/bmp",
};

// The ETag we send wraps GitHub's own ETag for the file, so we can revalidate with a
// conditional request to GitHub (which doesn't count against the rate limit).
const toEtag = (githubEtag: string | null, variant: string) => {
  if (!githubEtag) return null;
  return `"${Buffer.from(githubEtag).toString("base64url")}.${variant}"`;
};

const fromEtag = (etag: string | null, variant: string) => {
  const match = etag?.trim().match(/^(?:W\/)?"([^".]+)\.([^".]+)"$/);
  if (!match || match[2] !== variant) return null;
  try {
    return Buffer.from(match[1], "base64url").toString();
  } catch {
    return null;
  }
};

export async function GET(
  request: Request,
  context: { params: Promise<{ owner: string, repo: string, branch: string, path: string[] }> }
) {
  try {
    const params = await context.params;
    const timings: string[] = [];
    let mark = performance.now();
    const time = (name: string) => {
      const now = performance.now();
      timings.push(`${name};dur=${(now - mark).toFixed(1)}`);
      mark = now;
    };

    const { token, config } = await getCachedRepoReadContext(params);
    time("auth");

    const normalizedPath = normalizePath(params.path.join("/"));
    if (!normalizedPath || normalizedPath.startsWith("..")) throw createHttpError(`Invalid path "${params.path.join("/")}".`, 400);

    const extension = getFileExtension(normalizedPath).toLowerCase();
    if (!extensionCategories.image.includes(extension)) throw createHttpError(`"${normalizedPath}" is not an image.`, 400);

    const mediaConfigs: any[] = config.object.media || [];
    const isWithinMedia = mediaConfigs.some((item) => {
      const input = normalizePath(item.input || "");
      return !input || normalizedPath.startsWith(`${input}/`);
    });
    if (!isWithinMedia) throw createHttpError(`Invalid path "${normalizedPath}" for media.`, 400);

    const { searchParams } = new URL(request.url);
    const requestedWidth = parseInt(searchParams.get("w") || "", 10);
    // Snap to the closest allowed width (keeps the number of variants bounded)
    const width = Number.isFinite(requestedWidth) && requestedWidth > 0
      ? imageWidths.find((allowed) => allowed >= requestedWidth) ?? imageWidths[imageWidths.length - 1]
      : null;
    const variant = width ? `w${width}` : "full";

    const cacheControl = searchParams.get("v")
      // The URL is versioned with the file's SHA, it never changes
      ? "private, max-age=31536000, immutable"
      : "private, max-age=3600, stale-while-revalidate=86400";

    const githubEtag = fromEtag(request.headers.get("if-none-match"), variant);

    const githubResponse = await fetch(
      `https://api.github.com/repos/${params.owner}/${params.repo}/contents/${normalizedPath.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(params.branch)}`,
      {
        headers: {
          Accept: "application/vnd.github.raw+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          ...(githubEtag ? { "If-None-Match": githubEtag } : {}),
        },
        cache: "no-store",
      }
    );

    const etag = toEtag(githubResponse.headers.get("etag"), variant);
    const cacheHeaders: Record<string, string> = {
      "Cache-Control": cacheControl,
      ...(etag ? { ETag: etag } : {}),
    };

    if (githubResponse.status === 304) {
      return new Response(null, { status: 304, headers: cacheHeaders });
    }
    if (githubResponse.status === 404) throw createHttpError(`Image "${normalizedPath}" not found.`, 404);
    if (!githubResponse.ok) throw createHttpError(`Failed to fetch image from GitHub (${githubResponse.status}).`, githubResponse.status === 401 ? 401 : 502);

    const contentLength = parseInt(githubResponse.headers.get("content-length") || "0", 10);
    if (contentLength > MAX_SOURCE_BYTES) throw createHttpError(`Image "${normalizedPath}" is too large to display.`, 413);

    const source = Buffer.from(await githubResponse.arrayBuffer());
    if (source.byteLength > MAX_SOURCE_BYTES) throw createHttpError(`Image "${normalizedPath}" is too large to display.`, 413);
    time("github");

    const headers: Record<string, string> = {
      ...cacheHeaders,
      "X-Content-Type-Options": "nosniff",
      // Images are only ever meant to be embedded, this prevents an SVG from running
      // scripts if it's opened directly.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    };

    if (passthroughTypes[extension]) {
      return new Response(new Uint8Array(source), {
        headers: { ...headers, "Content-Type": passthroughTypes[extension], "Server-Timing": timings.join(", ") },
      });
    }

    // We only keep animations for larger sizes (thumbnails use the first frame)
    const animated = !width || width > 512;
    let pipeline = sharp(source, { animated }).rotate();
    if (width) {
      pipeline = pipeline.resize({
        width,
        height: width,
        fit: "inside",
        withoutEnlargement: true,
      });
    }
    const output = await pipeline.webp({ quality: width && width <= 512 ? 72 : 82 }).toBuffer();
    time("resize");

    return new Response(new Uint8Array(output), {
      headers: { ...headers, "Content-Type": "image/webp", "Server-Timing": timings.join(", ") },
    });
  } catch (error: any) {
    console.error(error);
    return toErrorResponse(error);
  }
}
