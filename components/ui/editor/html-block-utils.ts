import { Marked } from "marked";

/**
 * The editor only keeps content it has a node for (paragraphs, headings, lists, images,
 * tables...), anything else is dropped when it parses the source. These helpers find the
 * blocks of HTML the editor can't represent (embeds, videos, scripts, comments, custom
 * markup...) and swap them for a placeholder the `htmlBlock` node picks up, so they're
 * kept verbatim.
 */

export type HtmlBlockFormat = "html" | "markdown";

// Elements the editor has a node or mark for.
const SUPPORTED_TAGS = new Set([
  "p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "pre", "hr",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "colgroup", "col",
]);

// Inline elements: the editor keeps the ones it supports and unwraps the others (the text
// stays). A block starting with one of them is regular content.
const INLINE_TAGS = new Set([
  "a", "abbr", "b", "bdi", "bdo", "br", "cite", "code", "data", "del", "dfn", "em", "i",
  "img", "ins", "kbd", "mark", "q", "s", "samp", "small", "span", "strike", "strong", "sub",
  "sup", "time", "u", "var", "wbr",
]);

const PLACEHOLDER_ATTRIBUTE = "data-html-block";
const PLACEHOLDER_PATTERN = /<div data-html-block="([^"]*)"><\/div>/g;

const markdownLexer = new Marked({ gfm: true });

const decodeHtmlBlock = (value: string | null) => {
  try {
    return decodeURIComponent(value || "");
  } catch {
    return value || "";
  }
};

const createPlaceholder = (html: string) => (
  `<div ${PLACEHOLDER_ATTRIBUTE}="${encodeURIComponent(html)}"></div>`
);

// Check if a block of HTML has to be kept as is (i.e. the editor would drop part of it).
const shouldPreserveHtml = (html: string) => {
  const trimmedHtml = html.trim();
  if (trimmedHtml.startsWith("<!--")) return true;

  const firstTag = /^<\/?([a-zA-Z][\w:-]*)/.exec(trimmedHtml)?.[1]?.toLowerCase();
  if (!firstTag || INLINE_TAGS.has(firstTag)) return false;

  for (const match of trimmedHtml.matchAll(/<\/?([a-zA-Z][\w:-]*)/g)) {
    const tag = match[1].toLowerCase();
    if (!SUPPORTED_TAGS.has(tag) && !INLINE_TAGS.has(tag)) return true;
  }

  return false;
};

const markdownToEditorContent = (markdown: string) => {
  if (!markdown.includes("<")) return markdown;

  let hasPlaceholders = false;
  const content = markdownLexer.lexer(markdown).map((token) => {
    // A single line element that isn't block-level in Markdown (e.g. `<video></video>`)
    // comes through as a paragraph.
    const isCandidate = (token.type === "html" && token.block) || token.type === "paragraph";
    if (!isCandidate || !shouldPreserveHtml(token.raw)) return token.raw;

    hasPlaceholders = true;
    return `${createPlaceholder(token.raw.trim())}\n\n`;
  }).join("");

  return hasPlaceholders ? content : markdown;
};

const htmlToEditorContent = (html: string) => {
  if (typeof document === "undefined" || !html.includes("<")) return html;

  const template = document.createElement("template");
  template.innerHTML = html;

  let hasPlaceholders = false;
  Array.from(template.content.childNodes).forEach((node) => {
    let source: string | null = null;

    if (node.nodeType === Node.COMMENT_NODE) {
      source = `<!--${node.nodeValue ?? ""}-->`;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      if (!element.hasAttribute(PLACEHOLDER_ATTRIBUTE) && shouldPreserveHtml(element.outerHTML)) {
        source = element.outerHTML;
      }
    }

    if (source == null) return;

    const placeholder = document.createElement("div");
    placeholder.setAttribute(PLACEHOLDER_ATTRIBUTE, encodeURIComponent(source));
    node.parentNode?.replaceChild(placeholder, node);
    hasPlaceholders = true;
  });

  return hasPlaceholders ? template.innerHTML : html;
};

// Prepare a source value for the editor, swapping the HTML it can't represent with
// placeholders for the `htmlBlock` node.
const toEditorContent = (value: string, format: HtmlBlockFormat) => {
  if (!value) return value;
  return format === "markdown" ? markdownToEditorContent(value) : htmlToEditorContent(value);
};

// Swap the placeholders in the HTML serialized by the editor back to the original HTML.
const fromEditorHtml = (html: string) => (
  html.replace(PLACEHOLDER_PATTERN, (_match, encoded: string) => decodeHtmlBlock(encoded))
);

export {
  PLACEHOLDER_ATTRIBUTE,
  decodeHtmlBlock,
  shouldPreserveHtml,
  toEditorContent,
  fromEditorHtml,
};
