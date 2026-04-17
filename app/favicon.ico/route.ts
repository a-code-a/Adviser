const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="bg" x1="0%" x2="100%" y1="0%" y2="100%">
      <stop offset="0%" stop-color="#1b8f80" />
      <stop offset="100%" stop-color="#0d5b63" />
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="16" fill="url(#bg)" />
  <path
    d="M18 20h10c6.6 0 12 5.4 12 12s-5.4 12-12 12h-4v8h-6V20zm6 6v12h4c3.3 0 6-2.7 6-6s-2.7-6-6-6h-4z"
    fill="#f7f1e8"
  />
  <path
    d="M42 18h6v28c0 4.4-3.6 8-8 8h-6v-6h5c1.7 0 3-1.3 3-3V18z"
    fill="#f7f1e8"
  />
</svg>
`.trim();

export async function GET() {
  return new Response(svg, {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": "image/svg+xml"
    }
  });
}
