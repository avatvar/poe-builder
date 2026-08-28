import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_PAGES === "true";

const nextConfig: NextConfig = {
  output: isGitHubPages ? "export" : undefined,
  assetPrefix: isGitHubPages ? "https://avatvar.github.io/poe-builder" : "",
  trailingSlash: isGitHubPages,
};

export default nextConfig;
