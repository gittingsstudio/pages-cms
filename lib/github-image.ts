/**
 * Helper functions to translate relative paths into URLs for the image route
 * (`/api/[owner]/[repo]/[branch]/images/[...path]`), which serves (and resizes) images
 * from the repository, and back.
 */

import { decodePathSafely, normalizePath } from "@/lib/utils/file";

// Widths the image route can resize to.
const imageWidths = [96, 256, 512, 1024, 1600];

// Width used for images displayed in an editor.
const editorImageWidth = 1600;

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getImageRoute = (owner: string, repo: string, branch: string) => (
  `/api/${owner}/${repo}/${encodeURIComponent(branch)}/images/`
);

// Matches the prefix of URLs pointing at a file of the repo: image route URLs (relative
// or with an origin, e.g. when pasted) and raw.githubusercontent.com URLs.
const getRepoUrlPrefixPattern = (owner: string, repo: string, branch: string, flags = "i") => new RegExp(
  `^(?:(?:https?://[^/]+)?${escapeRegex(getImageRoute(owner, repo, branch))}`
  + `|https://raw\\.githubusercontent\\.com/${escapeRegex(owner)}/${escapeRegex(repo)}/${escapeRegex(encodeURIComponent(branch))}/)`,
  flags,
);

// Check if a URL points at a file of the repo (image route or raw.githubusercontent.com).
const isRepoUrl = (
  owner: string,
  repo: string,
  branch: string,
  url: string
) => getRepoUrlPrefixPattern(owner, repo, branch).test(url);

// Get the relative path for an image.
const getRelativeUrl = (
  owner: string,
  repo: string,
  branch: string,
  path: string,
  encode = true
) => {
  let relativePath = path.replace(getRepoUrlPrefixPattern(owner, repo, branch), "");

  relativePath = relativePath.split("#")[0]?.split("?")[0] || relativePath;
  relativePath = decodePathSafely(relativePath);

  return encode ? encodePath(relativePath) : relativePath;
}

// Get the URL to display an image of the repo, optionally resized to `width` (see
// `imageWidths`). `version` should be the SHA of the file when known, it lets the
// browser cache the image indefinitely.
const getImageUrl = (
  owner: string,
  repo: string,
  branch: string,
  path: string,
  options?: { width?: number; version?: string | null }
) => {
  const normalizedInputPath = normalizeImagePathInput(
    getRelativeUrl(owner, repo, branch, path, false),
  );
  if (!normalizedInputPath) return null;

  const query = new URLSearchParams();
  if (options?.width) query.set("w", String(options.width));
  if (options?.version) query.set("v", options.version);
  const queryString = query.toString();

  return `${getImageRoute(owner, repo, branch)}${encodePath(normalizedInputPath)}${queryString ? `?${queryString}` : ""}`;
};

const normalizeImagePathInput = (input: string) => {
  if (!input) return null;
  const value = decodePathSafely(input.trim());

  const markdownMatch = value.match(/^\[.*?\]\((.+)\)$/);
  const markdownLooseMatch = value.match(/^\[.*?\]\((.+)$/);
  let path = (
    markdownMatch?.[1]
    || markdownLooseMatch?.[1]?.replace(/\)$/, "")
    || value
  ).trim();

  path = path.split("#")[0]?.split("?")[0] || path;

  // Ignore absolute URLs (we only translate repo-relative media paths).
  if (/^https?:\/\//i.test(path)) return null;

  return normalizePath(decodePathSafely(path));
};

// Convert all image route (and raw.githubusercontent.com) URLs in a HTML string to
// relative paths.
const imageToRelativeUrls = (
  owner: string,
  repo: string,
  branch: string,
  html: string,
  encode = true
) => {
  const matches = getImgSrcs(html);
  if (matches.length === 0) return html;

  const replacements = new Map<string, string>();
  const prefix = getRepoUrlPrefixPattern(owner, repo, branch);

  for (const match of matches) {
    const src = match[1] || match[2];
    if (!prefix.test(src)) continue;
    if (replacements.has(src)) continue;

    let relativePath = src.replace(prefix, "");
    relativePath = relativePath.split("?")[0];
    if (!encode) relativePath = decodeURIComponent(relativePath);
    replacements.set(src, relativePath);
  }

  let newHtml = html;
  replacements.forEach((relativePath, src) => {
    const srcRegex = new RegExp(`(<img[^>]*\\ssrc=(["']))${escapeRegex(src)}(\\2)`, "g");
    newHtml = newHtml.replace(srcRegex, `$1${relativePath}$3`);
  });

  return newHtml;
}

// Convert all relative image paths in a HTML string to image route URLs.
const relativeToImageUrls = (
  owner: string,
  repo: string,
  branch: string,
  html: string,
  width?: number
) => {
  const matches = getImgSrcs(html);
  if (matches.length === 0) return html;

  const uniqueSources = Array.from(new Set(
    matches
      .map((match) => match[1] || match[2])
      .filter((src) => !src.startsWith("http://") && !src.startsWith("https://") && !src.startsWith("data:image/")),
  ));

  let newHtml = html;
  for (const src of uniqueSources) {
    const imageUrl = getImageUrl(owner, repo, branch, src, { width });
    if (!imageUrl || imageUrl === src) continue;
    const srcRegex = new RegExp(`(<img[^>]*\\ssrc=(["']))${escapeRegex(src)}(\\2)`, "g");
    newHtml = newHtml.replace(srcRegex, `$1${imageUrl}$3`);
  }

  return newHtml;
}

// Swap the prefix of an image path (raw.githubusercontent.com url <> relative path)
const swapPrefix = (
  path: string,
  from: string,
  to: string,
  relative = false
) => {
  if (
    path == null
    || from == null
    || to == null
    || (from === to)
    || path.startsWith("//")
    || path.startsWith("http://")
    || path.startsWith("https://")
    || path.startsWith("data:image/")
    || !path.startsWith(from)
  ) return path;
  
  let newPath;
  
  if (from === "" && to !== "/") {
    newPath = `${to}/${path}`;
  } else if (from === "" && to === "/") {
    newPath = `/${path}`;
  } else {
    const remainingPath = path.slice(from.length);
    newPath = to === "/" 
      ? `/${remainingPath.replace(/^\//, '')}` 
      : `${to}/${remainingPath.replace(/^\//, '')}`;
  }

  if (newPath && newPath.startsWith("/") && relative) newPath = newPath.substring(1);

  return newPath;
}

// Swap the prefix of all images in a HTML string.
const htmlSwapPrefix = (
  html: string,
  from: string,
  to: string,
  relative = false
) => {
  if (from === to || html == null || from == null || to == null) return html;
  
  let newHtml = html;
  const matches = getImgSrcs(newHtml);
  
  matches.forEach(match => {
    const src = match[1] || match[2];
    const quote = match[1] ? "\"" : "'";
    
    const newSrc = swapPrefix(src, from, to, relative);
    if (newSrc !== src) {
      // Use a regex with global flag to replace all occurrences
      const escapedSrc = escapeRegex(src); // Escape special regex chars
      const regex = new RegExp(`src=${quote}${escapedSrc}${quote}`, 'g');
      newHtml = newHtml.replace(regex, `src=${quote}${newSrc}${quote}`);
    }
  });

  return newHtml;
}

// Encode a path for use in a URL.
const encodePath = (path: string) => {
  return path.split("/").map(encodeURIComponent).join("/");
}

// Get all image sources from an HTML string.
const getImgSrcs = (html: string) => {
  const regex = /<img [^>]*src=(?:"([^"]+)"|'([^']+)')[^>]*>/g;
  return Array.from(html.matchAll(regex));
}

export {
  imageWidths,
  editorImageWidth,
  isRepoUrl,
  getRelativeUrl,
  getImageUrl,
  relativeToImageUrls,
  imageToRelativeUrls,
  swapPrefix,
  htmlSwapPrefix,
  encodePath,
  getImgSrcs,
};
