import path from 'path';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import proxyOptions from './proxyOptions';

const frappeUiSrc = path.resolve(__dirname, 'node_modules/frappe-ui/src');

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [
		// Disable asset-URL transforms: all <img src> are absolute runtime paths
		// served by Frappe (e.g. /assets/butler/images/...), not build assets.
		vue({ template: { transformAssetUrls: { includeAbsolute: false, tags: {} } } }),
		tailwindcss(),
	],
	server: {
		port: 8080,
		host: '0.0.0.0',
		proxy: proxyOptions
	},
	resolve: {
		alias: {
			'@': path.resolve(__dirname, 'src'),
			// Import only frappe-ui's data layer (no component barrel, which would
			// drag in Tailwind-v3 styles and ~icons we don't use).
			'@frappeui/resources': path.join(frappeUiSrc, 'resources/index.ts'),
			'@frappeui/request': path.join(frappeUiSrc, 'utils/frappeRequest.js'),
			'@frappeui/config': path.join(frappeUiSrc, 'utils/config.ts')
		}
	},
	build: {
		outDir: '../butler/public/frontend',
		emptyOutDir: true,
		target: 'es2015',
		rollupOptions: {
			onwarn(warning, warn) {
				if (warning.code === 'MODULE_LEVEL_DIRECTIVE') {
					return;
				}
				warn(warning);
			}
		}
	}
});
