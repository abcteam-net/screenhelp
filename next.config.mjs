/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Allow the ScreenHelp Chrome extension's side panel to embed the
          // app in an iframe. (chrome-extension://<id> is the side panel
          // origin.) We also allow self-hosting in any frame.
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'self' chrome-extension://* http://localhost:* https://localhost:*;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
