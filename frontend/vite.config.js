import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        host: true,
        port: 3000,
        allowedHosts: ['.ngrok-free.app', '.ngrok.io', '.ngrok.app'],
        proxy: {
            '/graphql': {
                target: 'http://backend:8000', // Internal Docker network
                changeOrigin: true,
            },
            // Anmeldung ueber Entra ID: zwei Browser-Umleitungen im Backend.
            // changeOrigin bleibt aus - das Backend baut aus dem Host-Header die
            // Rueckkehradresse, und die muss zum Browser zeigen, nicht ins
            // Containernetz.
            '/auth': {
                target: 'http://backend:8000',
                changeOrigin: false,
            },
            '/api': {
                target: 'http://backend:8000', // Internal Docker network
                changeOrigin: true,
            },
            '/media': {
                target: 'http://backend:8000', // Internal Docker network
                changeOrigin: true,
            },
            '/oauth': {
                target: 'http://backend:8000',
                changeOrigin: true,
            },
            '/.well-known': {
                target: 'http://backend:8000',
                changeOrigin: true,
            },
            '/mcp': {
                target: 'http://backend:8000',
                changeOrigin: true,
            },
        },
    },
});
