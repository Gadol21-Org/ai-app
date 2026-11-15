import { t } from "@/lib/i18n";

// Served as a route handler instead of `app/manifest.ts` because Next.js then adds its own
// <link rel="manifest"> without `crossorigin="use-credentials"`. Behind Cloudflare Access the
// browser fetches a manifest without cookies by default, gets redirected to the login page, and
// Android Chrome refuses to offer installation. The layout adds the link with credentials.
export const dynamic = "force-static";

export function GET() {
  const manifest = {
    id: "/",
    name: t.appName,
    short_name: t.appName,
    description: t.appDescription,
    lang: "he",
    dir: "rtl",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#18181b",
    theme_color: "#18181b",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" },
  });
}
