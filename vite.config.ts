import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves this repo from /starcraft-tmg-tarot/, not the domain root
  base: process.env.GITHUB_PAGES ? '/starcraft-tmg-tarot/' : '/',
})
