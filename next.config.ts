import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pins the workspace root to this project - without it, Turbopack infers a
  // root by walking up for the nearest lockfile and finds an unrelated one in
  // the home directory, which prints a misleading warning.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
