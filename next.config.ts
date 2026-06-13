import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Hay un package-lock.json suelto en el directorio padre; fijamos la raíz
  // del workspace para que Turbopack no lo infiera mal.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
