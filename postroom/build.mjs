// Bundles the Preact UI into public/app.js + public/app.css.
import * as esbuild from 'esbuild';
const watch = process.argv.includes('--watch');
const opts = {
  entryPoints: { app: 'src/main.jsx' },
  bundle: true,
  minify: !watch,
  sourcemap: watch,
  format: 'esm',
  target: ['es2021', 'safari15'],
  outdir: 'public',
  jsx: 'automatic',
  jsxImportSource: 'preact',
  loader: { '.css': 'css' },
  logLevel: 'info',
};
if (watch) await (await esbuild.context(opts)).watch();
else await esbuild.build(opts);
