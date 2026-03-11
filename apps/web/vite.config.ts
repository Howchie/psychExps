import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  base: command === "serve" ? "/" : "./",
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
