import { request } from "node:https";
import { lookup as dnsLookup } from "node:dns";
import { isIP } from "node:net";
import {
  constants as zlibConstants,
  createBrotliDecompress,
  createGunzip,
  createInflate,
} from "node:zlib";
import type { IncomingMessage } from "node:http";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";

/**
 * Fetching a web page for the agent. The page is untrusted input and the agent also holds tools
 * that touch the family's money and ads, so this file is deliberately strict:
 * https only, no private or internal addresses (checked on the address actually connected to,
 * so DNS tricks don't help), a size and time cap, and redirects to another site are handed back
 * to the caller instead of followed.
 */

const MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
const MAX_SAME_SITE_REDIRECTS = 5;
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX_ENTRIES = 50;
export const DEFAULT_MAX_CHARS = 20_000;
export const MAX_MAX_CHARS = 30_000;

export class WebFetchError extends Error {}

// ---- Address checks -------------------------------------------------------------------------

/** True for loopback, private, link-local, carrier-grade NAT, multicast and other non-public addresses. */
export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (version === 6) {
    const lower = address.toLowerCase().split("%")[0];
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    // ::ffff:a00:1 style mapped addresses are written in hex by some resolvers.
    if (lower.startsWith("::ffff:")) return true;
    return (
      lower === "::" ||
      lower === "::1" ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      /^fe[89ab]/.test(lower) ||
      lower.startsWith("ff") ||
      lower.startsWith("64:ff9b:") ||
      lower.startsWith("2001:db8")
    );
  }
  return true;
}

/** `dns.lookup` that refuses to hand back a non-public address; used as the socket's lookup. */
function safeLookup(
  hostname: string,
  options: unknown,
  callback: (
    err: Error | null,
    address?: string | { address: string; family: number }[],
    family?: number,
  ) => void,
) {
  dnsLookup(hostname, { all: true }, (err, addresses) => {
    if (err) return callback(err);
    const bad = addresses.find((a) => isPrivateAddress(a.address));
    if (bad || addresses.length === 0) {
      return callback(
        new WebFetchError(
          "This address is not on the public internet, so it is not fetched.",
        ),
      );
    }
    const wantsAll =
      typeof options === "object" &&
      options !== null &&
      (options as { all?: boolean }).all;
    if (wantsAll) return callback(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
}

/** Checks a URL before any request is made. Returns the normalised URL (http upgraded to https). */
export function parseFetchUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new WebFetchError("That is not a valid URL.");
  }
  if (url.protocol === "http:") url.protocol = "https:";
  if (url.protocol !== "https:")
    throw new WebFetchError("Only http and https links can be fetched.");
  if (url.username || url.password)
    throw new WebFetchError(
      "Links with a username or password are not fetched.",
    );
  if (url.port && url.port !== "443")
    throw new WebFetchError("Only the standard https port is allowed.");
  const host = url.hostname.toLowerCase();
  if (isIP(host.replace(/^\[|\]$/g, ""))) {
    if (isPrivateAddress(host.replace(/^\[|\]$/g, ""))) {
      throw new WebFetchError(
        "This address is not on the public internet, so it is not fetched.",
      );
    }
  } else if (
    !host.includes(".") ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    throw new WebFetchError("Only public websites can be fetched.");
  }
  url.hash = "";
  return url;
}

/** Same site for redirect purposes: identical host, ignoring a leading "www.". */
function sameSite(a: URL, b: URL) {
  const strip = (h: string) => h.toLowerCase().replace(/^www\./, "");
  return strip(a.hostname) === strip(b.hostname);
}

// ---- Download ------------------------------------------------------------------------------

type Downloaded = {
  status: number;
  headers: IncomingMessage["headers"];
  body: Buffer;
  /** The body was longer than the download cap and was cut. */
  cut: boolean;
};

function download(url: URL): Promise<Downloaded> {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: "GET",
        lookup: safeLookup as never,
        timeout: TIMEOUT_MS,
        headers: {
          "user-agent":
            "Mozilla/5.0 (compatible; KattanBot/1.0; family assistant)",
          accept:
            "text/html,application/xhtml+xml,text/markdown,text/plain,application/json;q=0.9,*/*;q=0.1",
          "accept-encoding": "gzip, deflate, br",
          "accept-language": "he,en;q=0.8",
        },
      },
      (res) => {
        const encoding = String(
          res.headers["content-encoding"] ?? "",
        ).toLowerCase();
        let stream: NodeJS.ReadableStream = res;
        if (encoding === "gzip" || encoding === "x-gzip")
          stream = res.pipe(createGunzip());
        else if (encoding === "deflate") stream = res.pipe(createInflate());
        else if (encoding === "br") {
          stream = res.pipe(
            createBrotliDecompress({
              params: { [zlibConstants.BROTLI_PARAM_SIZE_HINT]: 0 },
            }),
          );
        }
        const chunks: Buffer[] = [];
        let size = 0;
        let cut = false;
        const finish = () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
            cut,
          });
        stream.on("data", (chunk: Buffer) => {
          if (cut) return;
          size += chunk.length;
          chunks.push(chunk);
          if (size > MAX_DOWNLOAD_BYTES) {
            cut = true;
            req.destroy();
            finish();
          }
        });
        stream.on("end", () => !cut && finish());
        stream.on("error", (e) => !cut && reject(e));
        res.on("error", (e) => !cut && reject(e));
      },
    );
    req.on("timeout", () =>
      req.destroy(new WebFetchError("The site took too long to answer.")),
    );
    req.on("error", (e) => reject(e));
    req.end();
  });
}

// ---- Conversion ----------------------------------------------------------------------------

function decode(body: Buffer, contentType: string): string {
  const header = contentType.match(/charset=["']?([\w-]+)/i)?.[1];
  const sniffed =
    header ??
    body
      .subarray(0, 2048)
      .toString("latin1")
      .match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
  try {
    return new TextDecoder(sniffed ?? "utf-8").decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});
turndown.remove(["script", "style", "noscript", "iframe", "form", "button"]);
turndown.addRule("drop-svg", {
  filter: (node) => node.nodeName.toLowerCase() === "svg",
  replacement: () => "",
});

/** Turns an HTML page into Markdown of its main content, falling back to the whole body. */
export function htmlToMarkdown(
  html: string,
  pageUrl: string,
): { title: string; markdown: string } {
  const { document } = parseHTML(html);
  try {
    const base = document.createElement("base");
    base.setAttribute("href", pageUrl);
    document.head?.prepend(base);
  } catch {
    // A missing <head> only costs relative-link resolution.
  }
  const title = document.querySelector("title")?.textContent?.trim() ?? "";
  const article = new Readability(
    document.cloneNode(true) as unknown as Document,
  ).parse();
  const mainHtml =
    article?.content && (article.textContent ?? "").trim().length > 200
      ? article.content
      : (document.body?.innerHTML ?? html);
  const markdown = turndown
    .turndown(mainHtml)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { title: article?.title?.trim() || title, markdown };
}

// ---- Public API ----------------------------------------------------------------------------

export type FetchedPage = {
  url: string;
  title: string;
  contentType: string;
  /** Full converted text, before it is sliced for the model. */
  text: string;
  /** The download hit the size cap, so `text` is only the start of the page. */
  downloadCut: boolean;
};

export type FetchResult =
  | { kind: "page"; page: FetchedPage }
  | { kind: "redirect"; from: string; to: string };

const cache = new Map<string, { at: number; result: FetchResult }>();

export async function fetchPage(rawUrl: string): Promise<FetchResult> {
  let url = parseFetchUrl(rawUrl);
  const key = url.href;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.result;

  for (let hop = 0; ; hop++) {
    const res = await download(url);
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      const next = parseFetchUrl(
        new URL(String(res.headers.location), url).href,
      );
      if (!sameSite(url, next))
        return { kind: "redirect", from: url.href, to: next.href };
      if (hop >= MAX_SAME_SITE_REDIRECTS)
        throw new WebFetchError("Too many redirects.");
      url = next;
      continue;
    }
    if (res.status < 200 || res.status >= 300)
      throw new WebFetchError(`The site answered with HTTP ${res.status}.`);

    const contentType = String(
      res.headers["content-type"] ?? "text/html",
    ).toLowerCase();
    const mime = contentType.split(";")[0].trim();
    const isHtml = mime === "text/html" || mime === "application/xhtml+xml";
    const isText =
      mime.startsWith("text/") ||
      mime === "application/json" ||
      mime.endsWith("+json") ||
      mime.endsWith("xml");
    if (!isHtml && !isText) {
      throw new WebFetchError(
        `Content type ${mime || "unknown"} is not supported; only web pages and plain text are.`,
      );
    }
    const decoded = decode(res.body, contentType);
    const converted = isHtml
      ? htmlToMarkdown(decoded, url.href)
      : { title: "", markdown: decoded.trim() };
    const result: FetchResult = {
      kind: "page",
      page: {
        url: url.href,
        title: converted.title,
        contentType: mime,
        text: converted.markdown,
        downloadCut: res.cut,
      },
    };
    if (cache.size >= CACHE_MAX_ENTRIES)
      cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), result });
    return result;
  }
}

// ---- Which URLs the model may ask for -------------------------------------------------------

const URL_PATTERN = /https?:\/\/[^\s"'<>)\]}\\]+/gi;

/**
 * The model may only fetch a site a person or a tool has already put into the conversation
 * (the user's messages and tool results), never an address it made up, which blocks a page from
 * talking the model into sending data to a host of its own choosing. Fetching another page of a
 * site that was already mentioned is fine.
 */
export function isUrlInConversation(
  url: URL,
  messages: readonly unknown[],
): boolean {
  const sameHost = (candidate: string) => {
    try {
      return sameSite(new URL(candidate.replace(/[.,;:!?]+$/, "")), url);
    } catch {
      return false;
    }
  };
  for (const message of messages) {
    const { role, content } = message as { role?: string; content?: unknown };
    if (role !== "user" && role !== "tool") continue;
    const text =
      typeof content === "string" ? content : JSON.stringify(content);
    // JSON.stringify escapes slashes in some paths; undo that so URLs match.
    for (const found of text.replace(/\\\//g, "/").match(URL_PATTERN) ?? []) {
      if (sameHost(found)) return true;
    }
  }
  return false;
}

/** The slice of a page returned to the model, with paging info. */
export function slicePage(text: string, startIndex: number, maxChars: number) {
  const slice = text.slice(startIndex, startIndex + maxChars);
  const end = startIndex + slice.length;
  return {
    content: slice,
    totalChars: text.length,
    startIndex,
    nextStartIndex: end < text.length ? end : null,
  };
}
