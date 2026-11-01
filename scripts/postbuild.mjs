// GitHub Pages packaging.
//
// The Vite build is portable because base is "./", but a Pages project site is
// served from /<repo>/ and GitHub returns 404 for unknown paths. This step makes
// the artifact self-describing and safe to upload:
//   - .nojekyll      stops Pages from running the output through Jekyll
//   - 404.html       SPA fallback, so a refresh on any path still boots
//   - guards         fail the build on absolute asset paths or shipped sources
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const DIST = path.join(ROOT, 'dist');
const fail = (message) => {
  console.error(`postbuild: ${message}`);
  process.exit(1);
};

const indexPath = path.join(DIST, 'index.html');
if (!fs.existsSync(indexPath)) fail('dist/index.html is missing — run vite build first');

const html = fs.readFileSync(indexPath, 'utf8');

// A project page lives under /<repo>/, so every asset reference must be
// relative. Absolute /assets/ would 404 on the deployed site.
if (/(?:src|href)="\/assets\//.test(html)) {
  fail('index.html references /assets/ absolutely; Vite base must stay "./"');
}
if (/(?:src|href)="\/src\//.test(html)) {
  fail('index.html still references /src/ — this is a development build');
}

// Source maps would publish the whole source tree and multiply the artifact.
const maps = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.map')) maps.push(path.relative(DIST, full));
  }
};
walk(DIST);
if (maps.length) fail(`source maps present: ${maps.slice(0, 3).join(', ')}`);

// GitHub Pages treats a directory beginning with "_" specially unless this
// marker exists. Vite hashes assets, so this is cheap insurance.
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');

// A copied index.html would be wrong here: Pages serves 404.html without
// changing the URL, so relative ./assets would resolve under the missing path.
// The game has no client routes, so send unknown project-site paths back to the
// repository root (the first URL segment).
fs.writeFileSync(
  path.join(DIST, '404.html'),
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex" />
    <title>MICROCURE // RETURNING TO THE FEED</title>
    <script>
      (function () {
        var parts = location.pathname.split('/').filter(Boolean);
        location.replace('/' + (parts[0] || '') + '/');
      })();
    </script>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center;
        background: #0b0807; color: #e8dcc6; font: 12px/1.6 monospace;
        letter-spacing: 0.16em; }
    </style>
  </head>
  <body>RE-ENTERING THE SURGICAL FEED…</body>
</html>
`
);

const assets = fs.readdirSync(path.join(DIST, 'assets'));
const bytes = assets.reduce((sum, file) => sum + fs.statSync(path.join(DIST, 'assets', file)).size, 0);
console.log(
  `postbuild: pages artifact ready — ${assets.length} assets, ${(bytes / 1024).toFixed(0)} kB, .nojekyll + 404.html`
);
