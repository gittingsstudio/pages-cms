import slugify from "slugify";
import { getFileName, getRelativePath, normalizePath } from "@/lib/utils/file";

/**
 * Shared helpers for live previews of a branch's deployed site.
 *
 * `.pages.yml`:
 *
 *   preview:
 *     url: https://{branch}--my-site.netlify.app   # site root for the current branch
 *     branches:                                     # optional per-branch overrides
 *       main: https://www.example.com
 *     netlify:
 *       site: my-site                               # optional, adds build status
 *
 *   content:
 *     - name: posts
 *       preview:
 *         path: /blog/{name}                        # or `preview: false`
 */

type PreviewNetlifyConfig = {
  site: string;
};

type PreviewRootConfig = {
  url?: string;
  branches?: Record<string, string>;
  netlify?: PreviewNetlifyConfig;
};

type PreviewSchemaConfig = {
  path?: string;
};

type PreviewDeployState =
  | "building"
  | "ready"
  | "error"
  | "unknown";

type PreviewDeploy = {
  state: PreviewDeployState;
  rawState: string | null;
  context: string | null;
  commitRef: string | null;
  url: string | null;
  createdAt: string | null;
  publishedAt: string | null;
  errorMessage: string | null;
  adminUrl: string | null;
};

type PreviewStatus = {
  provider: "netlify";
  baseUrl: string | null;
  deploy: PreviewDeploy | null;
};

const getPreviewRootConfig = (configObject: any): PreviewRootConfig | null => {
  const preview = configObject?.preview;
  if (!preview) return null;
  if (typeof preview === "string") return { url: preview };
  if (typeof preview !== "object") return null;
  return preview as PreviewRootConfig;
};

const getPreviewSchemaConfig = (schema: any): PreviewSchemaConfig | false | null => {
  const preview = schema?.preview;
  if (preview === false) return false;
  if (!preview) return null;
  if (typeof preview === "string") return { path: preview };
  if (typeof preview !== "object") return null;
  return preview as PreviewSchemaConfig;
};

const isPreviewEnabled = (configObject: any, schema?: any) => {
  const root = getPreviewRootConfig(configObject);
  if (!root || (!root.url && !root.netlify?.site)) return false;
  return getPreviewSchemaConfig(schema) !== false;
};

// Netlify builds branch subdomains as `<branch>--<site>`, lowercased with any
// character that is not a letter, digit or hyphen replaced by a hyphen.
const toNetlifyBranchSlug = (branch: string) =>
  branch.toLowerCase().replace(/[^a-z0-9-]/g, "-");

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const resolvePreviewBaseUrl = (
  configObject: any,
  branch: string,
  fallbackUrl?: string | null,
): string | null => {
  const root = getPreviewRootConfig(configObject);
  if (!root) return null;

  const override = root.branches?.[branch];
  if (override) return trimTrailingSlash(override);

  if (root.url) {
    return trimTrailingSlash(
      root.url
        .replace(/\{branch\}/g, toNetlifyBranchSlug(branch))
        .replace(/\{branch_raw\}/g, encodeURIComponent(branch)),
    );
  }

  return fallbackUrl ? trimTrailingSlash(fallbackUrl) : null;
};

const stripExtension = (value: string) => value.replace(/\.[^/.]+$/, "");

// Kept local (not from lib/schema) so server routes don't load the field registry.
const getValueAtPath = (values: Record<string, unknown>, keyPath: string): unknown =>
  keyPath.split(".").reduce<unknown>((current, key) => (
    current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined
  ), values);

const getFilenameDate = (filename: string) => {
  const match = filename.match(/^(\d{4})-(\d{2})-(\d{2})-/);
  return match ? { year: match[1], month: match[2], day: match[3] } : null;
};

/**
 * Builds the page path for an entry from the content's `preview.path` template.
 *
 * Tokens:
 * - {filename}  file name without extension ("2024-05-01-hello")
 * - {name}      file name without extension or leading date ("hello")
 * - {path}      path inside the collection, without extension ("guides/hello")
 * - {year} {month} {day}  from a dated file name
 * - {fields.x} or {x}     a field value, slugified
 */
const resolvePreviewPath = (
  schema: any,
  entryPath: string | undefined,
  values: Record<string, unknown> | undefined,
): string => {
  const schemaPreview = getPreviewSchemaConfig(schema);
  const template = schemaPreview ? schemaPreview.path : undefined;
  if (!template) return "/";

  const normalizedEntryPath = entryPath ? normalizePath(entryPath) : "";
  const filename = normalizedEntryPath ? stripExtension(getFileName(normalizedEntryPath)) : "";
  const dateParts = filename ? getFilenameDate(filename) : null;
  const name = dateParts ? filename.replace(/^\d{4}-\d{2}-\d{2}-/, "") : filename;
  const relativePath = normalizedEntryPath && schema?.path != null
    ? stripExtension(getRelativePath(normalizedEntryPath, normalizePath(schema.path)))
    : filename;

  const resolved = template
    .replace(/\{filename\}/g, filename)
    .replace(/\{name\}/g, name)
    .replace(/\{path\}/g, relativePath)
    .replace(/\{year\}/g, dateParts?.year ?? "")
    .replace(/\{month\}/g, dateParts?.month ?? "")
    .replace(/\{day\}/g, dateParts?.day ?? "")
    .replace(/\{(?:fields\.)?([^}]+)\}/g, (_, fieldName: string) => {
      const value = values ? getValueAtPath(values, fieldName) : undefined;
      return value == null || value === ""
        ? ""
        : slugify(String(value), { lower: true, strict: true });
    });

  const withSlash = resolved.startsWith("/") ? resolved : `/${resolved}`;
  return withSlash.replace(/\/{2,}/g, "/");
};

const joinPreviewUrl = (baseUrl: string, pagePath: string) =>
  `${trimTrailingSlash(baseUrl)}${pagePath.startsWith("/") ? pagePath : `/${pagePath}`}`;

export {
  getPreviewRootConfig,
  getPreviewSchemaConfig,
  isPreviewEnabled,
  toNetlifyBranchSlug,
  resolvePreviewBaseUrl,
  resolvePreviewPath,
  joinPreviewUrl,
};

export type {
  PreviewRootConfig,
  PreviewSchemaConfig,
  PreviewDeploy,
  PreviewDeployState,
  PreviewStatus,
};
