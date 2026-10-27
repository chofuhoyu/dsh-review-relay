/** Build the browser half as the module-loader closure-factory artifact DSH expects. */
import { build } from 'esbuild'

const id = 'dsh-review-relay'

await build({
  entryPoints: ['src/client/index.tsx'],
  outfile: 'lib/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  sourcemap: true,
  legalComments: 'none',
  logLevel: 'info',
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  banner: {
    js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {
var module = { exports: {} }; var exports = module.exports;`,
  },
  footer: {
    js: `return module.exports
} });`,
  },
})
