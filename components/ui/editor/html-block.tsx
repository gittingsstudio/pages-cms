import { useEffect, useMemo, useState } from "react";
import { Node as TiptapNode } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from "@tiptap/react";
import { CodeXml, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  PLACEHOLDER_ATTRIBUTE,
  decodeHtmlBlock,
  shouldPreserveHtml,
} from "./html-block-utils";

type HtmlBlockPreview =
  | { type: "iframe"; src: string; title: string }
  | { type: "video" | "audio"; src: string };

// We only load URLs from other origins, an embed must never run with access to the app.
const toExternalUrl = (value: string | null | undefined) => {
  if (!value) return null;
  try {
    const url = new URL(value, window.location.href);
    if (!/^https?:$/.test(url.protocol) || url.origin === window.location.origin) return null;
    return url.href;
  } catch {
    return null;
  }
};

// The HTML is never rendered as is in the app. A block made of a single embed or media
// element gets a preview rebuilt from its URL, anything else is displayed as code.
const getPreview = (html: string): HtmlBlockPreview | null => {
  if (typeof document === "undefined") return null;

  const template = document.createElement("template");
  template.innerHTML = html.trim();
  if (template.content.childNodes.length !== 1) return null;

  const element = template.content.firstElementChild;
  if (!element) return null;

  switch (element.tagName) {
    case "IFRAME": {
      const src = toExternalUrl(element.getAttribute("src"));
      return src ? { type: "iframe", src, title: element.getAttribute("title") || "Embed" } : null;
    }
    case "VIDEO":
    case "AUDIO": {
      const src = toExternalUrl(
        element.getAttribute("src") ?? element.querySelector("source")?.getAttribute("src"),
      );
      return src ? { type: element.tagName === "VIDEO" ? "video" : "audio", src } : null;
    }
    default:
      return null;
  }
};

function HtmlBlockView({
  node,
  editor,
  selected,
  updateAttributes,
  deleteNode,
}: ReactNodeViewProps<HTMLDivElement>) {
  const html = (node.attrs.html as string) || "";
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(html);

  const preview = useMemo(() => getPreview(html), [html]);

  useEffect(() => {
    if (!isEditing) setDraft(html);
  }, [html, isEditing]);

  const handleApply = () => {
    const nextHtml = draft.trim();
    setIsEditing(false);
    if (!nextHtml) {
      deleteNode();
    } else if (nextHtml !== html) {
      updateAttributes({ html: nextHtml });
    }
  };

  const handleCancel = () => {
    setDraft(html);
    setIsEditing(false);
  };

  return (
    <NodeViewWrapper
      className={cn(
        "my-4 overflow-hidden rounded-md border bg-muted/30",
        selected && "ring-2 ring-ring ring-offset-2 ring-offset-background",
      )}
      contentEditable={false}
    >
      <div
        className="flex h-9 items-center gap-2 border-b px-3 text-xs text-muted-foreground"
        data-drag-handle
      >
        <CodeXml className="size-3.5" />
        <span className="font-medium">HTML</span>
        {editor.isEditable && (
          <div className="ml-auto flex items-center gap-1">
            {isEditing ? (
              <>
                <Button type="button" variant="ghost" size="xs" onClick={handleCancel}>Cancel</Button>
                <Button type="button" variant="secondary" size="xs" onClick={handleApply}>Done</Button>
              </>
            ) : (
              <>
                <Button type="button" variant="ghost" size="xs" onClick={() => setIsEditing(true)}>Edit</Button>
                <Button type="button" variant="ghost" size="icon-xs" onClick={deleteNode}>
                  <Trash2 />
                  <span className="sr-only">Delete</span>
                </Button>
              </>
            )}
          </div>
        )}
      </div>
      {isEditing ? (
        <Textarea
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              handleCancel();
            } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              handleApply();
            }
          }}
          className="min-h-24 rounded-none border-0 font-mono text-xs shadow-none focus-visible:ring-0"
          spellCheck={false}
        />
      ) : preview?.type === "iframe" ? (
        <iframe
          src={preview.src}
          title={preview.title}
          className="block aspect-video w-full"
          loading="lazy"
          sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
          allow="fullscreen; picture-in-picture; encrypted-media"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : preview?.type === "video" ? (
        <video src={preview.src} className="block max-h-96 w-full bg-black" controls preload="metadata" />
      ) : preview?.type === "audio" ? (
        <audio src={preview.src} className="block w-full p-3" controls preload="metadata" />
      ) : (
        <pre className="max-h-48 overflow-auto p-3 font-mono text-xs break-all whitespace-pre-wrap">{html}</pre>
      )}
    </NodeViewWrapper>
  );
}

// Holds a block of HTML the editor can't represent (see ./html-block-utils), and writes it
// back unchanged.
const HtmlBlock = TiptapNode.create({
  name: "htmlBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      html: {
        default: "",
        parseHTML: (element: HTMLElement) => decodeHtmlBlock(element.getAttribute(PLACEHOLDER_ATTRIBUTE)),
        renderHTML: (attributes: { html?: string }) => ({
          [PLACEHOLDER_ATTRIBUTE]: encodeURIComponent(attributes.html || ""),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: `div[${PLACEHOLDER_ATTRIBUTE}]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", HTMLAttributes];
  },

  renderMarkdown(node) {
    return (node.attrs?.html as string) || "";
  },

  addNodeView() {
    return ReactNodeViewRenderer(HtmlBlockView);
  },

  addProseMirrorPlugins() {
    const { editor, name } = this;

    return [
      new Plugin({
        key: new PluginKey("htmlBlockPaste"),
        props: {
          // Pasting the code of an embed (e.g. copied from YouTube) inserts it as a block
          // instead of text.
          handlePaste: (_view, event) => {
            const clipboardData = event.clipboardData;
            if (!clipboardData || clipboardData.files.length > 0) return false;
            if (editor.isActive("codeBlock")) return false;

            const text = clipboardData.getData("text/plain").trim();
            if (!/^<[\s\S]*>$/.test(text) || !shouldPreserveHtml(text)) return false;

            return editor.chain().focus().insertContent({ type: name, attrs: { html: text } }).run();
          },
        },
      }),
    ];
  },
});

export { HtmlBlock };
