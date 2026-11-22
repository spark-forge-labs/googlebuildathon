import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev:phone` serves the game over https on your Wi-Fi so phones allow
// the motion sensors (tilt controls only work on secure https:// pages).
export default defineConfig(({ mode }) =>
  mode === 'phone'
    ? { plugins: [basicSsl()], server: { host: true, port: 5173 } }
    : {}
);
