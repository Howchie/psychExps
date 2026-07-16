import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  base: command === "serve" ? "/" : "./",
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes("node_modules/pixi.js") || id.includes("node_modules/@pixi/")) return "vendor-pixi";
          if (id.includes("node_modules/jspsych") || id.includes("node_modules/@jspsych/")) return "vendor-jspsych";
          return undefined;
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    hmr: {
      path: "/exp/__vite_hmr",
      clientPort: 443,
      protocol: "wss",
    },
    allowedHosts: ["exp.howardfellowship-eeg.cloud.edu.au",'localhost', '*.localhost']
  },
}));
