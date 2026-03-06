import { defineConfig } from "vite";

export default defineConfig(() => ({
  base: "/",
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    hmr: {
      path: "/exp/__vite_hmr",
      clientPort: 80,
      protocol: "ws",
    },
    allowedHosts: ["exp.howardfellowship-eeg.cloud.edu.au",'localhost', '*.localhost']
  },
}));
