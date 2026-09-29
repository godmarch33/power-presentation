import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PLUGIN_VERSION } from './lib/versions.mjs';

export const PROFILE_SCHEMA = 'power-presentation/product-profile@0.1';

export const CLASSES = Object.freeze([
  'web-ui',
  'mobile',
  'desktop',
  'cli',
  'api/backend',
  'library/sdk',
  'data/ml',
  'mocks/design',
  'files/docs',
]);

export const UI_CLASSES = Object.freeze(CLASSES.slice(0, 3));
export const RUNNABLE_CLASSES = Object.freeze(CLASSES.slice(0, 7));
export const CONCEPT_CLASSES = Object.freeze(CLASSES.slice(7));

export const UI_SIGNALS = Object.freeze([
  'frontend-framework', 'python-ui-framework', 'static-site-generator', 'declared-url', 'html-entry', 'web-app-manifest',
  'mobile-framework', 'flutter-app', 'native-mobile-project',
  'desktop-framework', 'desktop-project-files',
]);

export const STRONG_RUNNABLE_SIGNALS = Object.freeze(['package-bin', 'pyproject-scripts', 'vhs-tape', 'openapi-spec', 'notebooks']);

export const SECONDARY_EVIDENCE = Object.freeze([
  'frontend-framework', 'python-ui-framework', 'static-site-generator', 'declared-url', 'html-entry', 'web-app-manifest',
  'mobile-framework', 'flutter-app', 'native-mobile-project', 'desktop-framework', 'desktop-project-files',
  'package-bin', 'pyproject-scripts', 'vhs-tape', 'bin-dir', 'cli-library', 'compiled-cli-entry', 'gem-executables',
  'openapi-spec', 'server-framework',
  'npm-library', 'python-library', 'compiled-library', 'framework-plugin', 'gemspec',
  'notebooks', 'notebooks-dir', 'dataset-files',
  'figma-link', 'mocks-dir', 'design-files',
  'docs-dir', 'document-files', 'only-md', 'datasets-only',
]);

export const SITE_DIRS_RE = /^(website|docs?|site|landing|www|marketing|homepage|storybook)$/i;
export const EXAMPLE_DIRS_RE = /^(examples?|samples?|demos?|playground|sandbox|benchmarks?|e2e|__tests__|tests?|spec|fixtures?)$/i;
export const DEV_TOOLING_DIRS_RE = /^(\.devcontainer|\.github|\.gitlab|\.circleci|ci|hack|scripts?|tools?|tests?|e2e|__tests__|dev(elopment|-.*)?)$/i;

export const IGNORED_DIRS = Object.freeze([
  '.git', '.hg', '.svn',
  'node_modules', 'bower_components', 'jspm_packages',
  'vendor', 'Pods', 'Carthage',
  'dist', 'build', 'out', 'target', '.next', '.nuxt', '.svelte-kit', '.output', '.parcel-cache',
  '.turbo', '.cache', '.gradle', '.dart_tool', 'DerivedData', '.terraform', '.serverless',
  'venv', '.venv', '.env', 'env', '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache', '.tox', '.eggs',
  'coverage', '.nyc_output', '.idea', '.vscode',
  'renders', 'videos', '.media', '.hyperframes', 'power-presentation-out',
]);

export const READ_DENY = Object.freeze([
  { id: 'env-files', test: (rel, base) => /^\.env/i.test(base) || /(^|\/)\.env[^/]*\//i.test(rel) },
  { id: 'pem', test: (_rel, base) => /\.pem$/i.test(base) },
  {
    id: 'fixtures',
    test: (rel) => /(^|\/)(fixtures?|__fixtures__|testdata|test[-_]data)\//i.test(rel),
  },
  {
    id: 'keys-and-credentials',
    source: 'heuristic',
    test: (_rel, base) =>
      /\.(key|p12|pfx|jks|keystore)$/i.test(base) ||
      /^(id_rsa|id_dsa|id_ecdsa|id_ed25519)(\.pub)?$/i.test(base) ||
      /^(secrets?|credentials?)\.(json|ya?ml|toml|env|txt)$/i.test(base),
  },
]);

export const FRONTEND_FRAMEWORKS = Object.freeze([
  'react', 'react-dom', 'next', 'vue', 'nuxt', 'svelte', '@sveltejs/kit', '@angular/core', 'solid-js',
  'astro', 'gatsby', '@remix-run/react', 'preact', 'lit', 'ember-source', '@builder.io/qwik', 'htmx.org',
  'alpinejs', '@hotwired/turbo', '@hotwired/stimulus',
]);

export const FRONTEND_TOOLING_FILES = /^(next|vite|vitest|nuxt|svelte|astro|remix|tailwind|postcss|webpack|rollup|angular)\.config\.[cm]?[jt]s$|^angular\.json$|^gatsby-config\.[jt]s$/;
export const FRONTEND_TOOLING_DEPS = Object.freeze(['vite', 'webpack', 'parcel', 'tailwindcss', '@vitejs/plugin-react', '@vitejs/plugin-vue', 'react-router', 'react-router-dom', 'vue-router', '@tanstack/react-query', 'styled-components', '@emotion/react', '@mui/material', '@chakra-ui/react', 'antd']);

export const SERVER_FRAMEWORKS = Object.freeze({
  npm: ['express', 'fastify', 'koa', '@hapi/hapi', '@nestjs/core', 'hono', 'elysia', 'restify', '@trpc/server', 'apollo-server', '@apollo/server', 'graphql-yoga'],
  python: ['fastapi', 'flask', 'django', 'starlette', 'aiohttp', 'litestar', 'sanic', 'tornado', 'falcon', 'bottle', 'strawberry-graphql'],
  go: ['github.com/gin-gonic/gin', 'github.com/labstack/echo', 'github.com/gofiber/fiber', 'github.com/go-chi/chi', 'github.com/gorilla/mux', 'google.golang.org/grpc', 'github.com/grpc-ecosystem'],
  rust: ['axum', 'actix-web', 'rocket', 'warp', 'tonic', 'poem', 'salvo'],
  ruby: ['sinatra', 'grape', 'hanami', 'roda'],
  java: ['spring-boot-starter-web', 'spring-boot-starter-webflux', 'quarkus-resteasy', 'micronaut-http', 'io.ktor:ktor-server', 'javalin'],
  php: ['laravel/framework', 'symfony/framework-bundle', 'slim/slim', 'lumen-framework'],
  dotnet: ['Microsoft.AspNetCore', 'Swashbuckle.AspNetCore'],
});

export const PYTHON_RUNTIME_ENTRIES = /^(manage\.py|wsgi\.py|asgi\.py|app\.py|main\.py|server\.py|application\.py|run\.py|Procfile)$/;
export const PYTHON_RUNTIME_DIRS_RE = /^(app|src|api|server|backend|service|web)$/;
export const PYTHON_SERVERS = Object.freeze(['uvicorn', 'gunicorn', 'hypercorn', 'daphne', 'waitress', 'granian']);
export const PYTHON_UI_FRAMEWORKS = Object.freeze(['streamlit', 'gradio', 'dash', 'panel', 'nicegui', 'reflex', 'flet', 'shiny', 'taipy', 'mesop']);
export const JVM_CLI_LIBRARIES = Object.freeze(['picocli', 'clikt', 'kotlinx-cli', 'jcommander', 'args4j']);

export const CLI_LIBRARIES = Object.freeze({
  npm: ['commander', 'yargs', 'oclif', '@oclif/core', 'meow', 'cac', 'citty', 'clipanion', 'sade', 'inquirer', '@clack/prompts', 'ink'],
  python: ['click', 'typer', 'fire', 'docopt', 'rich-click', 'cloup'],
  rust: ['clap', 'structopt', 'argh'],
  go: ['github.com/spf13/cobra', 'github.com/urfave/cli', 'github.com/alecthomas/kong'],
});

export const TERMINAL_HOSTS = Object.freeze(['ink', 'react-blessed', 'blessed']);

export const DATA_LIBRARIES = Object.freeze({
  python: ['torch', 'tensorflow', 'keras', 'jax', 'scikit-learn', 'sklearn', 'pandas', 'polars', 'numpy', 'scipy', 'xgboost', 'lightgbm', 'catboost', 'transformers', 'datasets', 'mlflow', 'dvc', 'prefect', 'airflow', 'apache-airflow', 'dagster', 'dbt-core', 'pyspark', 'statsmodels'],
  npm: ['@tensorflow/tfjs', 'onnxruntime-node', 'danfojs', 'ml5'],
});

export const MOBILE_MARKERS = Object.freeze({
  npm: ['react-native', 'expo', '@capacitor/core', '@ionic/react', '@ionic/angular', '@ionic/vue', 'nativescript'],
});

export const DESKTOP_MARKERS = Object.freeze({
  npm: ['electron', '@tauri-apps/api', '@tauri-apps/cli', 'nw', '@neutralinojs/neu', 'wails'],
});

export const DATASET_EXTENSIONS = Object.freeze([
  '.csv', '.tsv', '.parquet', '.arrow', '.feather', '.h5', '.hdf5', '.npz', '.npy', '.pkl', '.pickle',
  '.safetensors', '.onnx', '.pt', '.pth', '.ckpt', '.gguf', '.jsonl', '.avro', '.orc',
]);

export const MODEL_ARTEFACT_EXTENSIONS = Object.freeze(['.pt', '.pth', '.onnx', '.pkl', '.pickle', '.h5', '.hdf5', '.safetensors', '.ckpt', '.gguf', '.pb', '.tflite', '.joblib', '.dvc']);

export const DESIGN_EXTENSIONS = Object.freeze(['.fig', '.sketch', '.xd', '.pen', '.framerx', '.excalidraw', '.drawio', '.bmpr', '.balsamiq']);

export const TEXT_EXTENSIONS_FOR_LINKS = Object.freeze(['.md', '.mdx', '.markdown', '.txt', '.rst', '.html', '.htm', '.adoc']);

export const FIGMA_LINK_RE = /https?:\/\/(?:www\.)?figma\.com\/(?:file|design|proto|board|community|make)\/[A-Za-z0-9]+/g;

export const TEMPLATE_EXTENSIONS_RE = /\.(html|htm|erb|haml|slim|jinja2?|j2|twig|blade\.php|heex|eex|leex|ejs|hbs|pug|njk|mustache|liquid)$/i;

export const CODE_EXTENSIONS = Object.freeze([
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.mts', '.cts', '.py', '.pyx', '.rb', '.go', '.rs', '.java', '.kt', '.kts', '.swift', '.m', '.mm',
  '.c', '.cc', '.cpp', '.h', '.hpp', '.cs', '.fs', '.php', '.scala', '.clj', '.cljs', '.cljc', '.ex', '.exs', '.erl', '.hrl', '.hs', '.lua', '.dart',
  '.sh', '.bash', '.zsh', '.ps1', '.bat', '.cmd', '.r', '.jl', '.nim', '.zig', '.v', '.sol', '.vue', '.svelte', '.astro', '.ipynb',
  '.tf', '.hcl', '.tfvars', '.sql', '.nix', '.cmake', '.gradle', '.groovy', '.pl', '.pm', '.tcl', '.mk', '.make',
  '.ml', '.mli', '.elm', '.cr', '.d', '.f90', '.f95', '.f03', '.hx', '.res', '.gleam', '.pas', '.vb',
]);
export const CODE_BASENAMES = Object.freeze(['Makefile', 'GNUmakefile', 'Justfile', 'justfile', 'Rakefile', 'CMakeLists.txt', 'Taskfile.yml', 'BUILD', 'BUILD.bazel', 'WORKSPACE', 'dune-project', 'mix.exs', 'rebar.config']);

export const SIGNALS = Object.freeze({
  'web-ui': {
    signals: [
      { id: 'frontend-framework', signal: 'frontend framework in `dependencies` (or in devDependencies of a private app; for a publishable package devDependencies are tooling and peerDependencies mark a plugin)', kind: 'package-field', weight: 4 },
      { id: 'python-ui-framework', signal: 'streamlit / gradio / dash / panel / nicegui / reflex … in the Python dependencies (a browser UI served by Python)', kind: 'package-field', weight: 4 },
      { id: 'static-site-generator', signal: 'Jekyll (_config.yml + _posts/_layouts), Hugo (hugo.toml / config.toml + layouts/ or content/), Eleventy config', kind: 'glob', weight: 3, source: 'heuristic' },
      { id: 'declared-url', signal: 'a production URL was declared (--url) — the product has a web surface (secondary when the repo says cli / api / notebook)', kind: 'declared', weight: 4 },
      { id: 'web-app-manifest', signal: 'a server framework (Rails/Django/Flask/Express/Fastify/Sinatra/Gin/Spring …) with server-rendered templates (views/, templates/, layouts/, resources/views)', kind: 'glob', weight: 3, source: 'heuristic' },
      { id: 'html-entry', signal: 'index.html entry point (root, site/, www/, web/, client/, frontend/, app/, src/) — a static site is a web UI', kind: 'glob', weight: 3, source: 'heuristic' },
      { id: 'frontend-tooling', signal: 'frontend build config (next/vite/nuxt/svelte/astro/angular/tailwind config), UI libraries, or a framework only in devDependencies', kind: 'glob', weight: 2, source: 'heuristic' },
      { id: 'html-files', signal: 'HTML or server-template files in the tree (layouts/, templates/, views/, a page)', kind: 'glob', weight: 2, source: 'heuristic' },
      { id: 'static-site-assets', signal: 'stylesheets or scripts next to the HTML entry', kind: 'glob', weight: 1, source: 'heuristic' },
      { id: 'docs-site', signal: 'a framework or index.html only inside website/ docs/ site/ www/ landing/ next to a CLI / API / notebook / server (a companion site, not the product UI)', kind: 'package-field', weight: 1, source: 'heuristic' },
    ],
  },
  mobile: {
    signals: [
      { id: 'mobile-framework', signal: 'react-native / expo / capacitor / ionic in dependencies (a frontend framework next to it counts here, not as web-ui)', kind: 'package-field', weight: 4, source: 'heuristic' },
      { id: 'flutter-app', signal: 'pubspec.yaml with a `flutter:` section plus ios/ or android/', kind: 'glob', weight: 4, source: 'heuristic' },
      { id: 'native-mobile-project', signal: '*.xcodeproj / *.xcworkspace with an iOS Info.plist, or android/app/build.gradle(.kts)', kind: 'glob', weight: 3, source: 'heuristic' },
    ],
    note: 'mobile has no documented detection signal; the signals above are heuristics. Capture backend is simctl/adb (v1).',
  },
  desktop: {
    signals: [
      { id: 'desktop-framework', signal: 'electron / tauri / neutralino / wails in dependencies or devDependencies, src-tauri/ or wails.json (a frontend framework or index.html next to it counts here, not as web-ui)', kind: 'package-field', weight: 4, source: 'heuristic' },
      { id: 'desktop-project-files', signal: 'src-tauri/tauri.conf.json, *.xcodeproj with a macOS target, WPF/WinForms *.csproj', kind: 'glob', weight: 3, source: 'heuristic' },
    ],
    note: 'desktop has no documented detection signal; the signals above are heuristics. Electron is captured by the Playwright backend (record-flow); native desktop = user OS recorder (v1).',
  },
  cli: {
    signals: [
      { id: 'package-bin', signal: '`bin` field in package.json', kind: 'package-field', weight: 4 },
      { id: 'pyproject-scripts', signal: 'pyproject.toml [project.scripts] / [tool.poetry.scripts], setup.py/setup.cfg console_scripts', kind: 'package-field', weight: 4 },
      { id: 'vhs-tape', signal: '*.tape (VHS terminal recording script)', kind: 'glob', weight: 4 },
      { id: 'bin-dir', signal: 'bin/ directory with executables (framework scaffolds such as bin/rails, bin/setup, bin/www excluded)', kind: 'glob', weight: 2 },
      { id: 'gem-executables', signal: '*.gemspec with `executables` or an exe/ directory', kind: 'package-field', weight: 3, source: 'heuristic' },
      { id: 'cli-library', signal: 'commander / yargs / oclif / ink / click / typer / clap / cobra in dependencies', kind: 'package-field', weight: 2, source: 'heuristic' },
      { id: 'compiled-cli-entry', signal: 'Cargo [[bin]] or src/main.rs; Go main.go or cmd/*/main.go; JVM application mainClass / picocli / clikt — never next to a server framework', kind: 'glob', weight: 2, source: 'heuristic' },
      { id: 'cli-extras', signal: 'man/ pages or shell completions/ directory', kind: 'glob', weight: 1, source: 'heuristic' },
    ],
  },
  'api/backend': {
    signals: [
      { id: 'openapi-spec', signal: 'openapi.* / swagger.* specification', kind: 'glob', weight: 4 },
      { id: 'dockerfile', signal: 'Dockerfile (not under .devcontainer/, .github/, ci/, scripts/ … — those are developer environments)', kind: 'glob', weight: 2 },
      { id: 'no-frontend-framework', signal: 'runnable backend (server framework or root Dockerfile) with no frontend framework', kind: 'absence', weight: 1 },
      { id: 'server-framework', signal: 'express / fastify / nest / fastapi / flask / django / gin / axum / spring-boot … in dependencies with a runtime entry (not a reusable app or middleware)', kind: 'package-field', weight: 3, source: 'heuristic' },
      { id: 'api-schema-files', signal: '*.proto, schema.graphql / *.graphql, prisma/schema.prisma, docker-compose*.yml, serverless.yml', kind: 'glob', weight: 2, source: 'heuristic' },
    ],
  },
  'library/sdk': {
    signals: [
      { id: 'npm-library', signal: 'package.json with exports/module/types (or main + files/publishConfig), no `bin`, not private, no server runtime', kind: 'package-field', weight: 3, source: 'heuristic' },
      { id: 'python-library', signal: 'pyproject.toml [project]/[tool.poetry] or setup.py without console scripts and without a server runtime entry', kind: 'package-field', weight: 3, source: 'heuristic' },
      { id: 'compiled-library', signal: 'Cargo [lib] / src/lib.rs without src/main.rs; go.mod without main.go or cmd/; Package.swift; *.podspec; Maven/Gradle jar without Spring/mainClass; composer type library; Dart/Flutter package (pubspec + lib/, no platform dirs)', kind: 'glob', weight: 3, source: 'heuristic' },
      { id: 'gemspec', signal: '*.gemspec at the root', kind: 'glob', weight: 3, source: 'heuristic' },
      { id: 'framework-plugin', signal: 'a frontend or server framework in peerDependencies (a plugin / component library for that framework)', kind: 'package-field', weight: 2, source: 'heuristic' },
      { id: 'publish-signals', signal: 'peerDependencies / publishConfig / files / types / index.d.ts', kind: 'package-field', weight: 1, source: 'heuristic' },
      { id: 'examples-dir', signal: 'examples/ directory next to a README quickstart (a sample app with its own package.json counts here, not as the product UI)', kind: 'glob', weight: 1 },
    ],
    note: 'library/sdk has no dedicated signal; "no frontend framework + package without bin" is the working assumption (encoded above as heuristics).',
  },
  'data/ml': {
    signals: [
      { id: 'notebooks', signal: '*.ipynb', kind: 'glob', weight: 4 },
      { id: 'notebooks-dir', signal: 'notebooks/ directory', kind: 'glob', weight: 2 },
      { id: 'data-dir', signal: 'data/ directory (with code in the repo)', kind: 'glob', weight: 2 },
      { id: 'dataset-files', signal: 'dataset / model files: *.csv, *.parquet, *.h5, *.npz, *.pkl, *.safetensors, *.onnx, *.pt … (with code in the repo)', kind: 'glob', weight: 2 },
      { id: 'ml-pipeline-files', signal: 'dvc.yaml / *.dvc, MLproject, environment.yml / conda.yaml, models/ holding model artefacts', kind: 'glob', weight: 2, source: 'heuristic' },
      { id: 'data-library', signal: 'torch / tensorflow / scikit-learn / pandas / jax / transformers … in dependencies', kind: 'package-field', weight: 2, source: 'heuristic' },
    ],
  },
  'mocks/design': {
    signals: [
      { id: 'figma-link', signal: 'links to Figma (figma.com/file|design|proto|board) in README, docs, design/, mocks/', kind: 'content', weight: 4 },
      { id: 'mocks-dir', signal: 'mocks/ directory', kind: 'glob', weight: 3 },
      { id: 'design-files', signal: '*.fig, *.sketch, *.xd, *.pen, *.excalidraw, *.drawio', kind: 'glob', weight: 3, source: 'heuristic' },
      { id: 'design-dir', signal: 'design/, mockups/, wireframes/, prototypes/ directory', kind: 'glob', weight: 2, source: 'heuristic' },
    ],
  },
  'files/docs': {
    signals: [
      { id: 'only-md', signal: 'only .md files or documents (pdf/docx/pptx) — no code, no UI, no design, no datasets, no runnable artefact', kind: 'absence', weight: 4 },
      { id: 'datasets-only', signal: 'datasets only (no code, no UI, no notebooks)', kind: 'absence', weight: 4 },
      { id: 'docs-dir', signal: 'docs/ directory', kind: 'glob', weight: 2 },
      { id: 'document-files', signal: '*.pdf, *.docx, *.pptx, *.xlsx, *.epub in the tree', kind: 'glob', weight: 2 },
    ],
  },
});

export const SCENES = Object.freeze([
  { type: 'product-ui', classes: ['web-ui', 'mobile', 'desktop'], role: 'ui', source: '`<video class="clip">` from footage with punch-in', phase: 'MVP', note: 'mobile and desktop via --recording (v1)' },
  { type: 'terminal / code', classes: ['cli', 'library/sdk'], role: 'terminal', source: 'VHS frames, code/terminal block, diff', phase: 'MVP' },
  { type: 'api-card', classes: ['api/backend'], role: 'api', source: 'request, response, status, latency', phase: 'MVP' },
  { type: 'metrics / chart', classes: ['data/ml', '*'], role: 'data', source: '`data-chart` from `metrics.json` with a source', phase: 'MVP', note: 'the storyboard has no `data` role' },
  { type: 'comparison', classes: ['library/sdk', '*'], role: 'code', source: 'before/after wipe', phase: 'MVP' },
  { type: 'diagram', classes: ['api/backend', 'data/ml'], role: 'diagram', source: 'animated architecture from registry blocks', phase: 'v1' },
  { type: 'design-frames', classes: ['mocks/design'], role: 'design', source: 'static Figma/PNG export inside `browser-device-stage`, disclaimer "Design preview"', phase: 'MVP' },
  { type: 'file / doc', classes: ['files/docs'], role: 'file', source: 'document scroll plus a typed excerpt', phase: 'MVP' },
  { type: 'logo-outro', classes: ['*'], role: 'outro', source: 'end card per QA-13: brand, promise, CTA', phase: 'MVP', note: 'the storyboard has no role for the end card' },
]);

export const CAPTURE_BY_CLASS = Object.freeze({
  'web-ui': { backend: 'playwright-screencast', needs_url: true, phase: 'MVP', chrome_needed_for: 'capture (Playwright screencast) and render' },
  mobile: { backend: 'simctl/adb (v1) or --recording', needs_url: false, phase: 'v1', chrome_needed_for: 'render only' },
  desktop: { backend: 'playwright-screencast (Electron) or --recording (native, v1)', needs_url: false, phase: 'MVP/v1', chrome_needed_for: 'capture (Playwright screencast, Electron) and render' },
  cli: { backend: 'vhs-tape', needs_url: false, phase: 'MVP', chrome_needed_for: 'render only' },
  'api/backend': { backend: 'live-api-call', needs_url: false, phase: 'MVP', chrome_needed_for: 'render only' },
  'library/sdk': { backend: 'vhs-tape', needs_url: false, phase: 'MVP', chrome_needed_for: 'render only' },
  'data/ml': { backend: 'metrics.json / notebook run', needs_url: false, phase: 'MVP', chrome_needed_for: 'render only' },
  'mocks/design': { backend: 'static-export', needs_url: false, phase: 'MVP', chrome_needed_for: 'render only' },
  'files/docs': { backend: 'document', needs_url: false, phase: 'MVP', chrome_needed_for: 'render only' },
});

export const USAGE = `Usage: node scripts/inspect-project.mjs [--repo <dir>] [--url <prod-url>] [--out product-profile.json] [--print]
                                        [--max-files 20000] [--max-depth 8]
       node scripts/inspect-project.mjs --list-signals | --list-scenes
       node scripts/inspect-project.mjs --help

Detects the product class ("surface") of a repository and writes product-profile.json
(surface, confidence, candidates, secondary classes, scenes, capture backend, the
question when ambiguous). A product without UI needs no URL. Never opens.env*,
*.pem or fixtures.
Classes: ${CLASSES.join(' | ')}
Exit: 0 ok (even when ambiguous), 1 runtime failure, 2 usage error.`;

export function parseArgs(argv) {
  const opts = {
    repo: process.cwd(), url: null, out: 'product-profile.json', print: false,
    maxFiles: 20000, maxDepth: 8, listSignals: false, listScenes: false, help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--list-signals') opts.listSignals = true;
    else if (a === '--list-scenes') opts.listScenes = true;
    else if (a === '--print') opts.print = true;
    else if (a === '--repo') opts.repo = path.resolve(argv[++i] ?? '.');
    else if (a === '--url') opts.url = argv[++i] ?? null;
    else if (a === '--out') opts.out = argv[++i] ?? opts.out;
    else if (a === '--max-files' || a === '--max-depth') {
      const v = Number.parseInt(argv[++i] ?? '', 10);
      if (!Number.isInteger(v) || v < 1) throw new Error(`${a} needs a positive integer`);
      if (a === '--max-files') opts.maxFiles = v; else opts.maxDepth = v;
    } else throw new Error(`unknown argument: ${a}`);
  }
  if (opts.url !== null) {
    let parsed;
    try { parsed = new URL(opts.url); } catch { throw new Error(`--url is not a valid URL: ${opts.url}`); }
    if (!/^https?:$/.test(parsed.protocol)) throw new Error(`--url must be http(s): ${opts.url}`);
  }
  return opts;
}

export function readDenied(rel) {
  const base = path.posix.basename(rel);
  for (const rule of READ_DENY) if (rule.test(rel, base)) return rule.id;
  return null;
}

export function walkRepo(root, { maxFiles = 20000, maxDepth = 8 } = {}) {
  const files = [];
  const dirs = [];
  const skipped = {};
  const ignored = {};
  const unreadable = [];
  let truncated = false;
  const queue = [{ abs: root, rel: '', depth: 0 }];
  while (queue.length > 0) {
    const { abs, rel, depth } = queue.shift();
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      unreadable.push(rel || '.');
      continue;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const ent of entries) {
      if (ent.isSymbolicLink()) continue;
      const childRel = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) {
        if (IGNORED_DIRS.includes(ent.name)) { ignored[ent.name] = (ignored[ent.name] ?? 0) + 1; continue; }
        if (depth + 1 > maxDepth) { truncated = true; continue; }
        dirs.push(childRel);
        queue.push({ abs: path.join(abs, ent.name), rel: childRel, depth: depth + 1 });
      } else if (ent.isFile()) {
        if (files.length >= maxFiles) { truncated = true; continue; }
        const denied = readDenied(childRel);
        if (denied) skipped[denied] = (skipped[denied] ?? 0) + 1;
        let size = 0;
        try { size = fs.statSync(path.join(abs, ent.name)).size; } catch { }
        const ext = path.posix.extname(ent.name).toLowerCase();
        files.push({ rel: childRel, base: ent.name, ext, dir: rel, depth: depth + 1, size, denied });
      }
    }
  }
  files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  dirs.sort();
  return { files, dirs, truncated, skipped, ignored, unreadable };
}

export const MAX_TEXT_BYTES = 512 * 1024;
export const MAX_LINK_FILES = 60;
export const MAX_PACKAGE_JSON = 24;
export const MAX_MANIFESTS = 24;

function makeReader(root) {
  const opened = new Set();
  const oversized = new Set();
  const unreadableFiles = new Set();
  const limits = { oversized_files: oversized, unreadable_files: unreadableFiles, link_files_skipped: 0, package_json_skipped: 0, manifests_skipped: 0 };
  function readText(rel, limit = MAX_TEXT_BYTES) {
    if (readDenied(rel)) return null;
    try {
      const abs = path.join(root, rel);
      const st = fs.statSync(abs);
      if (!st.isFile()) return null;
      if (st.size > limit) { oversized.add(rel); return null; }
      const txt = fs.readFileSync(abs, 'utf8');
      opened.add(rel);
      return txt;
    } catch (err) {
      if (err && err.code && err.code !== 'ENOENT' && err.code !== 'ENOTDIR') unreadableFiles.add(rel);
      return null;
    }
  }
  function readJson(rel) {
    const txt = readText(rel);
    if (txt === null) return null;
    try { return JSON.parse(txt); } catch { return null; }
  }
  return { readText, readJson, opened, limits };
}

export function libraryShape(json) {
  if (!json || json.private === true) return false;
  if (json.bin && (typeof json.bin === 'string' || (typeof json.bin === 'object' && Object.keys(json.bin).length > 0))) return false;
  if (['exports', 'module', 'types', 'typings'].some((k) => json[k] !== undefined)) return true;
  return typeof json.main === 'string' && (json.files !== undefined || json.publishConfig !== undefined || !/^(\.\/)?(index|server|app)\.[cm]?js$/.test(json.main));
}

const keysOf = (obj) => (obj && typeof obj === 'object' ? Object.keys(obj) : []);

function readPackages(rd, files) {
  const list = files
    .filter((f) => f.base === 'package.json' && f.depth <= 3 && !f.denied)
    .sort((a, b) => a.depth - b.depth || (a.rel < b.rel ? -1 : 1));
  if (list.length > MAX_PACKAGE_JSON) rd.limits.package_json_skipped = list.length - MAX_PACKAGE_JSON;
  const all = [];
  const bins = [];
  for (const f of list.slice(0, MAX_PACKAGE_JSON)) {
    const json = rd.readJson(f.rel);
    if (!json || typeof json !== 'object') continue;
    const segments = f.dir ? f.dir.split('/') : [];
    const role = segments.some((s) => EXAMPLE_DIRS_RE.test(s)) ? 'example' : segments.some((s) => SITE_DIRS_RE.test(s)) ? 'site' : 'app';
    const deps = new Set([...keysOf(json.dependencies), ...keysOf(json.optionalDependencies)]);
    const devDeps = new Set(keysOf(json.devDependencies));
    const peer = new Set(keysOf(json.peerDependencies));
    const publishable = libraryShape(json) || peer.size > 0;
    const hostDeps = publishable ? deps : new Set([...deps, ...devDeps]);
    const host = DESKTOP_MARKERS.npm.some((d) => hostDeps.has(d)) ? 'desktop'
      : MOBILE_MARKERS.npm.some((d) => hostDeps.has(d)) ? 'mobile'
        : TERMINAL_HOSTS.some((d) => hostDeps.has(d)) ? 'terminal' : null;
    const bin = json.bin && (typeof json.bin === 'string' || (typeof json.bin === 'object' && Object.keys(json.bin).length > 0))
      ? (typeof json.bin === 'string' ? json.bin : Object.keys(json.bin).join(',')) : null;
    all.push({ rel: f.rel, dir: f.dir, json, role, host, publishable, deps, devDeps, peer, bin });
    if (role === 'app' && bin) bins.push({ rel: f.rel, bin });
  }
  const rootEntry = all.find((p) => p.rel === 'package.json') ?? null;
  const rootPkg = rootEntry?.json ?? null;
  const workspace = !!rootPkg && rootPkg.private === true
    && (Array.isArray(rootPkg.workspaces) || (rootPkg.workspaces && typeof rootPkg.workspaces === 'object')
      || files.some((f) => f.depth === 1 && /^(pnpm-workspace\.ya?ml|lerna\.json|rush\.json)$/.test(f.base))
      || all.some((p) => p.role === 'app' && p.rel !== 'package.json'));
  return { root: rootPkg, rootEntry, all, bins, workspace };
}

function pkgEvidence(pkgList, wanted, which = 'deps') {
  const out = [];
  for (const name of wanted) {
    const hit = pkgList.find((p) => p[which].has(name));
    if (hit) out.push(`${hit.rel}:${name}`);
  }
  return out;
}

function stripHashComments(txt) {
  return txt.split('\n').map((line) => {
    let inQ = null;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (inQ) { if (ch === inQ) inQ = null; continue; }
      if (ch === '"' || ch === "'") inQ = ch;
      else if (ch === '#') return line.slice(0, i);
    }
    return line;
  }).join('\n');
}

function tomlSections(txt) {
  const out = [];
  let header = '';
  let body = [];
  for (const line of txt.split('\n')) {
    const m = /^\s*\[\[?([^\]]+)\]\]?\s*$/.exec(line);
    if (m) { out.push({ header, body: body.join('\n') }); header = m[1].trim(); body = []; } else body.push(line);
  }
  out.push({ header, body: body.join('\n') });
  return out;
}

function readPython(rd, files) {
  const find = (base) => files.find((f) => f.depth === 1 && f.base === base && !f.denied)
    ?? files.find((f) => f.depth === 2 && f.base === base && !f.denied && PYTHON_RUNTIME_DIRS_RE.test(f.dir));
  const has = (base) => Boolean(find(base));
  const out = { present: false, name: null, scripts: false, deps: new Set(), buildSystem: false, dir: '' };
  const pyprojectFile = find('pyproject.toml');
  const pyproject = pyprojectFile ? rd.readText(pyprojectFile.rel) : null;
  if (pyprojectFile) out.dir = pyprojectFile.dir;
  if (pyproject !== null) {
    out.present = true;
    const clean = stripHashComments(pyproject);
    const sections = tomlSections(clean);
    out.buildSystem = sections.some((s) => s.header === 'build-system');
    for (const s of sections) {
      if ((s.header === 'project' || s.header === 'tool.poetry') && !out.name) {
        const nameM = /^\s*name\s*=\s*["']([^"']+)["']/m.exec(s.body);
        if (nameM) out.name = nameM[1];
      }
      if (/^(project\.scripts|project\.gui-scripts|tool\.poetry\.scripts)$/.test(s.header) && /^\s*(?:"[^"]+"|'[^']+'|[\w.-]+)\s*=/m.test(s.body)) out.scripts = true;
      if (/^tool\.poetry(\.group\.[\w-]+)?\.(dev-)?dependencies$/.test(s.header)) {
        for (const m of s.body.matchAll(/^\s*(?:"([^"]+)"|([A-Za-z0-9][A-Za-z0-9._-]*))\s*=/gm)) out.deps.add((m[1] ?? m[2]).toLowerCase());
      }
    }
    for (const m of clean.matchAll(/["']([A-Za-z0-9][A-Za-z0-9._-]*)(?:\s*[<>=!~\[;@][^"']*)?["']/g)) out.deps.add(m[1].toLowerCase());
  }
  const setupCfg = has('setup.cfg') ? rd.readText(find('setup.cfg').rel) : null;
  if (setupCfg !== null) {
    out.present = true;
    if (/^\s*console_scripts\s*=/m.test(setupCfg)) out.scripts = true;
    const nameM = /^name\s*=\s*(\S+)/m.exec(setupCfg);
    if (nameM && !out.name) out.name = nameM[1];
    for (const m of setupCfg.matchAll(/^\s+([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:[<>=!~;\s]|$)/gm)) out.deps.add(m[1].toLowerCase());
  }
  const setupPy = has('setup.py') ? rd.readText(find('setup.py').rel) : null;
  if (setupPy !== null) {
    out.present = true;
    if (/console_scripts/.test(setupPy)) out.scripts = true;
    const nameM = /name\s*=\s*["']([^"']+)["']/.exec(setupPy);
    if (nameM && !out.name) out.name = nameM[1];
    for (const m of setupPy.matchAll(/["']([A-Za-z0-9][A-Za-z0-9._-]*)(?:[<>=!~\[][^"']*)?["']/g)) out.deps.add(m[1].toLowerCase());
  }
  for (const f of files) {
    if (!f.denied && /^requirements(-[\w.]+)?\.txt$/.test(f.base) && (f.depth === 1 || (f.depth === 2 && PYTHON_RUNTIME_DIRS_RE.test(f.dir)))) {
      const txt = rd.readText(f.rel);
      if (txt === null) continue;
      for (const line of txt.split('\n')) {
        const m = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(line);
        if (m && !line.trim().startsWith('#') && !line.trim().startsWith('-')) out.deps.add(m[1].toLowerCase());
      }
    }
  }
  return out;
}

function readCargo(rd, files) {
  const rootFile = files.find((f) => f.depth === 1 && f.base === 'Cargo.toml' && !f.denied);
  if (!rootFile) return { present: false };
  const txt = stripHashComments(rd.readText('Cargo.toml') ?? '');
  const out = { present: true, bin: false, lib: false, workspace: /^\[workspace\]/m.test(txt), deps: new Set(), hasPackage: /^\[package\]/m.test(txt), members: [], memberDirs: [] };
  const scan = (text, rel) => {
    if (/^\[\[bin\]\]/m.test(text)) out.bin = true;
    if (/^\[lib\]/m.test(text)) out.lib = true;
    for (const m of text.matchAll(/^\s*([A-Za-z0-9_-]+)\s*=\s*(?:["{]|\d)/gm)) out.deps.add(m[1].toLowerCase());
    if (rel !== 'Cargo.toml') { out.members.push(rel); out.memberDirs.push(path.posix.dirname(rel)); }
  };
  scan(txt, 'Cargo.toml');
  if (out.workspace) {
    const members = files.filter((f) => f.base === 'Cargo.toml' && f.depth > 1 && f.depth <= 3 && !f.denied).slice(0, MAX_MANIFESTS);
    for (const f of members) scan(stripHashComments(rd.readText(f.rel) ?? ''), f.rel);
  }
  return out;
}

function readGoMod(rd, files) {
  const present = files.some((f) => f.depth === 1 && f.base === 'go.mod' && !f.denied);
  if (!present) return { present: false };
  const txt = rd.readText('go.mod') ?? '';
  const deps = new Set();
  for (const line of txt.split('\n')) {
    if (/\/\/\s*indirect/.test(line)) continue;
    if (/^\s*(module|replace|exclude|retract|go|toolchain)\b/.test(line)) continue;
    const m = /^\s*(?:require\s+)?([a-z0-9.-]+\.[a-z]+\/\S+)\s+v/.exec(line);
    if (m) deps.add(m[1]);
  }
  return { present: true, deps };
}

function readRootText(rd, files, base) {
  const f = files.find((x) => x.depth === 1 && x.base === base && !x.denied);
  return f ? (rd.readText(f.rel) ?? '') : '';
}

const cap = (arr, n = 6) => arr.slice(0, n);
const hasDir = (dirs, name) => dirs.some((d) => d === name || d.endsWith(`/${name}`));
const rootHasDir = (dirs, name) => dirs.includes(name);
const filesIn = (files, dirName) => files.filter((f) => f.rel.startsWith(`${dirName}/`));
const underDevTooling = (rel) => rel.split('/').slice(0, -1).some((seg) => DEV_TOOLING_DIRS_RE.test(seg));

export const BIN_SCAFFOLD_BASENAMES = Object.freeze(['rails', 'rake', 'setup', 'console', 'dev', 'importmap', 'bundle', 'spring', 'www', 'dev-server', 'rspec', 'yarn', 'webpack', 'webpack-dev-server', 'update', 'docker-entrypoint', 'jobs', 'brakeman', 'rubocop', 'thrust', 'kamal', 'ci']);

export function evaluateSignals(ctx) {
  const { rd, files, dirs, url } = ctx;
  const matched = [];
  const add = (cls, id, evidence) => {
    if (!evidence || evidence.length === 0) return;
    const def = SIGNALS[cls].signals.find((s) => s.id === id);
    if (!def) throw new Error(`unknown signal ${cls}/${id}`);
    matched.push({ id, class: cls, kind: def.kind, weight: def.weight, source: def.source, evidence: cap(evidence) });
  };
  const readable = files.filter((f) => !f.denied);
  const rootFiles = readable.filter((f) => f.depth === 1);
  const byBase = (re, list = readable) => list.filter((f) => re.test(f.base)).map((f) => f.rel);

  const pkgs = readPackages(rd, readable);
  const pkg = pkgs.root;
  const repoDesktopMarkers = [];
  if (dirs.includes('src-tauri')) repoDesktopMarkers.push('src-tauri/');
  if (rootFiles.some((f) => f.base === 'wails.json')) repoDesktopMarkers.push('wails.json');
  if (repoDesktopMarkers.length > 0) for (const p of pkgs.all) if (p.role === 'app' && p.host === null) p.host = 'desktop';
  const appPkgs = pkgs.all.filter((p) => p.role === 'app');
  const sitePkgs = pkgs.all.filter((p) => p.role === 'site');
  const examplePkgs = pkgs.all.filter((p) => p.role === 'example');
  const hostedPkgs = appPkgs.filter((p) => p.host !== null);
  const unhostedPkgs = appPkgs.filter((p) => p.host === null);
  const py = readPython(rd, readable);
  const cargo = readCargo(rd, readable);
  const gomod = readGoMod(rd, readable);
  const gemfile = readRootText(rd, readable, 'Gemfile');
  const composer = readRootText(rd, readable, 'composer.json');
  const pom = readRootText(rd, readable, 'pom.xml') + readRootText(rd, readable, 'build.gradle') + readRootText(rd, readable, 'build.gradle.kts');
  const csproj = readable.filter((f) => f.depth <= 2 && /\.csproj$/i.test(f.base)).map((f) => rd.readText(f.rel) ?? '').join('\n');
  const pubspec = rootFiles.some((f) => f.base === 'pubspec.yaml') ? (rd.readText('pubspec.yaml') ?? '') : '';
  const gemspecs = rootFiles.filter((f) => /\.gemspec$/.test(f.base));
  const gemspec = gemspecs.map((f) => rd.readText(f.rel) ?? '').join('\n');
  const mixExs = readRootText(rd, readable, 'mix.exs');

  const codeFiles = readable.filter((f) => CODE_EXTENSIONS.includes(f.ext) || CODE_BASENAMES.includes(f.base));
  const binDirFiles = filesIn(readable, 'bin').filter((f) => !BIN_SCAFFOLD_BASENAMES.includes(f.base.replace(/\.[^.]+$/, '')));
  const exeDirFiles = filesIn(readable, 'exe');
  const hasCode = codeFiles.length > 0 || pkgs.bins.length > 0 || py.scripts || cargo.bin === true || binDirFiles.length > 0 || exeDirFiles.length > 0;

  const tapes = byBase(/\.tape$/i);
  const openapiFiles = readable
    .filter((f) => /^(openapi|swagger)([.-]v?\d+(\.\d+)*)?\.(json|ya?ml)$/i.test(f.base) || /\.openapi\.(json|ya?ml)$/i.test(f.base))
    .map((f) => f.rel);
  const notebooks = byBase(/\.ipynb$/i);
  const strongRunnablePresent = pkgs.bins.length > 0 || py.scripts || tapes.length > 0 || openapiFiles.length > 0 || notebooks.length > 0;

  const dockerfiles = readable.filter((f) => (/^Dockerfile(\..+)?$/.test(f.base) || /\.dockerfile$/i.test(f.base)) && f.depth <= 3 && !underDevTooling(f.rel)).map((f) => f.rel);
  const rootDockerfile = dockerfiles.some((r) => !r.includes('/'));
  const pyName = (py.name ?? '').toLowerCase().replace(/-/g, '_');
  const pyRuntimeEntry = readable.some((f) => PYTHON_RUNTIME_ENTRIES.test(f.base)
    && (f.depth === 1 || PYTHON_RUNTIME_DIRS_RE.test(f.dir) || (py.dir && f.dir === py.dir) || (pyName && f.dir.replace(/-/g, '_').split('/').pop() === pyName)))
    || PYTHON_SERVERS.some((d) => py.deps.has(d));
  const pyServer = SERVER_FRAMEWORKS.python.filter((d) => py.deps.has(d));
  const pyUi = PYTHON_UI_FRAMEWORKS.filter((d) => py.deps.has(d));
  const npmServer = pkgEvidence(appPkgs, SERVER_FRAMEWORKS.npm);
  const serverLibs = [
    ...npmServer,
    ...((pyRuntimeEntry || rootDockerfile || py.scripts) ? pyServer.map((d) => `python:${d}`) : []),
    ...(gomod.present ? SERVER_FRAMEWORKS.go.filter((d) => [...gomod.deps].some((g) => g.startsWith(d))).map((d) => `go.mod:${d}`) : []),
    ...(cargo.present ? SERVER_FRAMEWORKS.rust.filter((d) => cargo.deps.has(d)).map((d) => `Cargo.toml:${d}`) : []),
    ...SERVER_FRAMEWORKS.ruby.filter((d) => new RegExp(`^\\s*gem\\s+['"]${d}['"]`, 'm').test(gemfile)).map((d) => `Gemfile:${d}`),
    ...SERVER_FRAMEWORKS.java.filter((d) => pom.includes(d)).map((d) => `pom.xml|build.gradle:${d}`),
    ...SERVER_FRAMEWORKS.php.filter((d) => composer.includes(d)).map((d) => `composer.json:${d}`),
    ...SERVER_FRAMEWORKS.dotnet.filter((d) => csproj.includes(d)).map((d) => `*.csproj:${d}`),
  ];
  if (/org\.springframework\.boot/.test(pom) && !serverLibs.some((e) => e.includes('spring-boot'))) serverLibs.push('build.gradle|pom.xml:org.springframework.boot');
  if (/^\s*gem\s+['"]rails['"]/m.test(gemfile) && !hasDir(dirs, 'app/views')) serverLibs.push('Gemfile:rails (API-only)');
  const serverlessFiles = readable.filter((f) => /^serverless\.ya?ml$/i.test(f.base) && f.depth === 1).map((f) => f.rel);
  const backendRuntime = serverLibs.length > 0 || rootDockerfile || serverlessFiles.length > 0;
  const companionOnly = strongRunnablePresent || serverLibs.length > 0;

  const feEvidenceOf = (pk) => {
    const names = FRONTEND_FRAMEWORKS.filter((d) => !pk.peer.has(d) && (pk.deps.has(d) || (!pk.publishable && pk.devDeps.has(d))));
    return names.map((d) => `${pk.rel}:${d}${pk.deps.has(d) ? '' : ' (devDependencies)'}`);
  };
  const fe = unhostedPkgs.flatMap(feEvidenceOf);
  const feHosted = hostedPkgs.flatMap(feEvidenceOf);
  const feDevTooling = appPkgs.filter((p) => p.publishable).flatMap((pk) => FRONTEND_FRAMEWORKS.filter((d) => pk.devDeps.has(d) && !pk.deps.has(d)).map((d) => `${pk.rel}:${d} (devDependencies)`));
  const feSite = pkgEvidence(sitePkgs, FRONTEND_FRAMEWORKS).concat(pkgEvidence(sitePkgs, FRONTEND_FRAMEWORKS, 'devDeps'));
  const feExample = pkgEvidence(examplePkgs, FRONTEND_FRAMEWORKS).concat(pkgEvidence(examplePkgs, FRONTEND_FRAMEWORKS, 'devDeps'));
  const rootHost = pkgs.rootEntry?.host ?? (appPkgs.length === 1 ? appPkgs[0].host : null) ?? (repoDesktopMarkers.length > 0 ? 'desktop' : null);
  const tooling = [
    ...rootFiles.filter((f) => FRONTEND_TOOLING_FILES.test(f.base)).map((f) => f.rel),
    ...pkgEvidence(unhostedPkgs, FRONTEND_TOOLING_DEPS),
    ...pkgEvidence(unhostedPkgs, FRONTEND_TOOLING_DEPS, 'devDeps'),
    ...feDevTooling,
  ];
  const productEntries = readable
    .filter((f) => f.base === 'index.html' && (f.depth === 1 || /^(src|app|web|client|frontend)$/.test(f.dir)))
    .map((f) => f.rel);
  const siteEntries = readable.filter((f) => f.base === 'index.html' && /^(site|www)$/.test(f.dir)).map((f) => f.rel);
  const htmlEntries = companionOnly ? productEntries : [...productEntries, ...siteEntries];
  const companionEntries = companionOnly ? siteEntries : [];
  const templateFiles = readable.filter((f) => TEMPLATE_EXTENSIONS_RE.test(f.base) && !f.rel.split('/').slice(0, -1).some((seg) => EXAMPLE_DIRS_RE.test(seg)) && !/(^|\/)(email|mail|emails|mailers?)(\/|$)/i.test(f.dir));
  const hasTemplates = templateFiles.some((f) => /(^|\/)(templates|views|layouts|resources\/views)(\/|$)/.test(f.dir));
  const webAppMarkers = [];
  if (/^\s*gem\s+['"]rails['"]/m.test(gemfile) && hasDir(dirs, 'app/views')) webAppMarkers.push('Gemfile:rails + app/views');
  if (py.deps.has('django') && hasTemplates) webAppMarkers.push('django + templates/');
  if (py.deps.has('flask') && hasTemplates) webAppMarkers.push('flask + templates/');
  if (/laravel\/framework/.test(composer) && rootHasDir(dirs, 'resources')) webAppMarkers.push('composer:laravel + resources/');
  if (/phoenix_live_view|phoenix_html/.test(mixExs)) webAppMarkers.push('mix.exs:phoenix_html');
  if (/spring-boot-starter-thymeleaf/.test(pom)) webAppMarkers.push('spring-boot-starter-thymeleaf');
  if (webAppMarkers.length === 0 && serverLibs.length > 0 && hasTemplates) webAppMarkers.push(`${serverLibs[0]} + ${templateFiles.find((f) => /(^|\/)(templates|views|layouts|resources\/views)(\/|$)/.test(f.dir)).dir}/`);
  const ssg = [];
  if (rootFiles.some((f) => f.base === '_config.yml') && ['_posts', '_layouts', '_includes'].some((d) => rootHasDir(dirs, d))) ssg.push('_config.yml + _posts/_layouts (Jekyll)');
  if (rootFiles.some((f) => /^(hugo|config)\.(toml|ya?ml|json)$/.test(f.base)) && (rootHasDir(dirs, 'layouts') || rootHasDir(dirs, 'content')) && !pkg) ssg.push('hugo.toml|config.toml + layouts/|content/ (Hugo)');
  if (rootFiles.some((f) => /^\.eleventy\.(js|cjs|mjs)$|^eleventy\.config\.(js|cjs|mjs)$/.test(f.base))) ssg.push('eleventy config');
  if (rootHost === null) {
    add('web-ui', 'frontend-framework', fe);
    add('web-ui', 'frontend-tooling', tooling);
    add('web-ui', 'html-entry', htmlEntries);
    add('web-ui', 'html-files', templateFiles.map((f) => f.rel));
    add('web-ui', 'static-site-generator', ssg);
    if (htmlEntries.length > 0) {
      const entryDirs = htmlEntries.map((h) => { const d = path.posix.dirname(h); return d === '.' ? '' : d; });
      const assets = readable.filter((f) => /\.(css|scss|js|mjs|ts)$/i.test(f.base) && entryDirs.some((dir) => f.dir === dir || (dir !== '' && f.rel.startsWith(`${dir}/`)))).map((f) => f.rel);
      add('web-ui', 'static-site-assets', assets);
    }
    if (fe.length === 0) add('web-ui', 'docs-site', [...feSite, ...companionEntries]);
  }
  if (pyUi.length > 0 && (pyRuntimeEntry || py.scripts || readable.some((f) => f.ext === '.py'))) add('web-ui', 'python-ui-framework', pyUi.map((d) => `python:${d}`));
  if (url) add('web-ui', 'declared-url', [`--url ${url}`]);
  add('web-ui', 'web-app-manifest', webAppMarkers);
  const frontendPresent = fe.length > 0 || webAppMarkers.length > 0 || htmlEntries.length > 0 || pyUi.length > 0 || ssg.length > 0 || hasTemplates;
  const hasUiOrCode = hasCode || frontendPresent || templateFiles.length > 0 || rootHost === 'mobile' || rootHost === 'desktop' || hostedPkgs.length > 0;

  const mobilePkgs = hostedPkgs.filter((p) => p.host === 'mobile');
  const mobileDeps = mobilePkgs.flatMap((pk) => MOBILE_MARKERS.npm.filter((d) => pk.deps.has(d) || pk.devDeps.has(d)).map((d) => `${pk.rel}:${d}`));
  add('mobile', 'mobile-framework', [...mobileDeps, ...mobilePkgs.flatMap(feEvidenceOf), ...(rootHost === 'mobile' ? htmlEntries : [])]);
  if (/^flutter:\s*$/m.test(pubspec) && (rootHasDir(dirs, 'ios') || rootHasDir(dirs, 'android'))) add('mobile', 'flutter-app', ['pubspec.yaml:flutter + ios/|android/']);
  const nativeMobile = [];
  const xcodeprojs = dirs.filter((d) => /\.(xcodeproj|xcworkspace)$/.test(d));
  const infoPlists = readable.filter((f) => f.base === 'Info.plist');
  const plistText = (f) => rd.readText(f.rel, 64 * 1024) ?? '';
  if (xcodeprojs.length > 0 && infoPlists.some((f) => /UILaunchStoryboardName|UIRequiredDeviceCapabilities|LSRequiresIPhoneOS/.test(plistText(f)))) nativeMobile.push(`${xcodeprojs[0]} + iOS Info.plist`);
  if (readable.some((f) => /^android\/app\/build\.gradle(\.kts)?$/.test(f.rel) || /^app\/src\/main\/AndroidManifest\.xml$/.test(f.rel))) nativeMobile.push('android/app/build.gradle | app/src/main/AndroidManifest.xml');
  if (/com\.android\.application/.test(pom)) nativeMobile.push('build.gradle:com.android.application');
  add('mobile', 'native-mobile-project', nativeMobile);

  const desktopPkgs = hostedPkgs.filter((p) => p.host === 'desktop');
  const desktopDeps = desktopPkgs.flatMap((pk) => DESKTOP_MARKERS.npm.filter((d) => pk.deps.has(d) || pk.devDeps.has(d)).map((d) => `${pk.rel}:${d}`));
  desktopDeps.push(...repoDesktopMarkers);
  if (!repoDesktopMarkers.includes('wails.json') && gomod.present && [...gomod.deps].some((g) => g.startsWith('github.com/wailsapp/wails'))) desktopDeps.push('go.mod:wails');
  add('desktop', 'desktop-framework', [...desktopDeps, ...desktopPkgs.flatMap(feEvidenceOf), ...(rootHost === 'desktop' ? htmlEntries : [])]);
  const desktopFiles = [];
  if (readable.some((f) => f.rel === 'src-tauri/tauri.conf.json')) desktopFiles.push('src-tauri/tauri.conf.json');
  if (xcodeprojs.length > 0 && infoPlists.some((f) => /NSPrincipalClass|LSMinimumSystemVersion/.test(plistText(f)))) desktopFiles.push(`${xcodeprojs[0]} + macOS Info.plist`);
  if (/<UseWPF>true<\/UseWPF>|<UseWindowsForms>true<\/UseWindowsForms>/i.test(csproj)) desktopFiles.push('*.csproj:UseWPF|UseWindowsForms');
  add('desktop', 'desktop-project-files', desktopFiles);

  const pkgBin = pkgs.bins.length > 0;
  add('cli', 'package-bin', pkgs.bins.map((b) => `${b.rel}:bin=${b.bin}`));
  if (py.scripts) add('cli', 'pyproject-scripts', ['pyproject.toml|setup.cfg|setup.py: console scripts']);
  add('cli', 'vhs-tape', tapes);
  if (binDirFiles.length > 0 && webAppMarkers.length === 0 && serverLibs.length === 0) add('cli', 'bin-dir', binDirFiles.map((f) => f.rel));
  const gemExec = [];
  if (gemspecs.length > 0 && /\.executables\s*=/.test(gemspec)) gemExec.push(`${gemspecs[0].rel}:executables`);
  if (gemspecs.length > 0 && exeDirFiles.length > 0) gemExec.push('exe/');
  add('cli', 'gem-executables', gemExec);
  const strongCli = pkgBin || py.scripts || tapes.length > 0 || binDirFiles.length > 0 || gemExec.length > 0;
  const terminalPkgs = hostedPkgs.filter((p) => p.host === 'terminal');
  const SERVER_ENTRY_RE = /^(server|api|serve|srv|httpd|web|backend|service|daemon|worker|gateway|app)$/i;
  const goEntries = readable.filter((f) => f.base === 'main.go' && (f.depth === 1 || /^cmd\//.test(f.rel))).map((f) => f.rel);
  const rustMains = readable.filter((f) => f.rel === 'src/main.rs' || cargo.memberDirs?.some((d) => f.rel === `${d}/src/main.rs`)).map((f) => f.rel);
  const rustBins = readable.filter((f) => /(^|\/)src\/bin\/[^/]+\.rs$/.test(f.rel)).map((f) => f.rel);
  const nonServerEntries = [
    ...goEntries.filter((r) => /^cmd\//.test(r) && !SERVER_ENTRY_RE.test(r.split('/')[1])),
    ...rustBins.filter((r) => !SERVER_ENTRY_RE.test(path.posix.basename(r, '.rs'))),
  ];
  const cliAllowed = serverLibs.length === 0 || strongCli || nonServerEntries.length > 0;
  const cliLibs = cliAllowed ? [
    ...pkgEvidence(appPkgs, CLI_LIBRARIES.npm),
    ...terminalPkgs.flatMap(feEvidenceOf),
    ...CLI_LIBRARIES.python.filter((d) => py.deps.has(d)).map((d) => `python:${d}`),
    ...(cargo.present ? CLI_LIBRARIES.rust.filter((d) => cargo.deps.has(d)).map((d) => `Cargo.toml:${d}`) : []),
    ...(gomod.present ? CLI_LIBRARIES.go.filter((d) => [...gomod.deps].some((g) => g.startsWith(d))).map((d) => `go.mod:${d}`) : []),
    ...JVM_CLI_LIBRARIES.filter((d) => pom.includes(d)).map((d) => `build.gradle|pom.xml:${d}`),
  ] : [];
  add('cli', 'cli-library', cliLibs);
  const compiledCli = [];
  if (serverLibs.length === 0) {
    if (cargo.present && (cargo.bin || rustMains.length > 0 || rustBins.length > 0)) compiledCli.push(cargo.bin ? 'Cargo.toml:[[bin]]' : (rustMains[0] ?? rustBins[0]));
    if (gomod.present) compiledCli.push(...goEntries);
    if (pom !== '' && /mainClass|Main-Class|application\s*\{|exec-maven-plugin|maven-shade-plugin/.test(pom) && !/com\.android\.(application|library)/.test(pom)) compiledCli.push('build.gradle|pom.xml: application mainClass');
    if (/^executables:\s*$/m.test(pubspec) || readable.some((f) => /^bin\/[^/]+\.dart$/.test(f.rel))) compiledCli.push('pubspec.yaml:executables | bin/*.dart');
  } else {
    compiledCli.push(...nonServerEntries);
  }
  add('cli', 'compiled-cli-entry', compiledCli);
  const cliExtras = [];
  if (hasCode && (rootHasDir(dirs, 'man') || readable.some((f) => /\.[1-8]$/.test(f.base) && /(^|\/)man/.test(f.dir)))) cliExtras.push('man/');
  if (hasCode && (rootHasDir(dirs, 'completions') || rootHasDir(dirs, 'completion'))) cliExtras.push('completions/');
  add('cli', 'cli-extras', cliExtras);

  add('api/backend', 'openapi-spec', openapiFiles);
  if (hasCode) add('api/backend', 'dockerfile', dockerfiles);
  add('api/backend', 'server-framework', serverLibs);
  if (hasCode) {
    add('api/backend', 'api-schema-files', readable
      .filter((f) => !underDevTooling(f.rel) && (/\.proto$/i.test(f.base) || /\.graphqls?$/i.test(f.base) || f.rel === 'prisma/schema.prisma'
        || /^docker-compose(\..+)?\.ya?ml$/i.test(f.base) || /^compose(\..+)?\.ya?ml$/i.test(f.base) || /^serverless\.ya?ml$/i.test(f.base)))
      .map((f) => f.rel));
  }

  const isLibraryPkg = (pk) => pk.role === 'app' && libraryShape(pk.json) && pk.host === null
    && !SERVER_FRAMEWORKS.npm.some((d) => pk.deps.has(d)) && !FRONTEND_FRAMEWORKS.some((d) => pk.deps.has(d) && !pk.peer.has(d));
  const libraryPkgs = appPkgs.filter(isLibraryPkg);
  const npmLib = [];
  if (pkgs.rootEntry && isLibraryPkg(pkgs.rootEntry) && !frontendPresent && serverlessFiles.length === 0) {
    npmLib.push(`package.json:${['main', 'exports', 'module', 'types', 'typings'].filter((k) => pkg[k] !== undefined).join(',')}`);
  } else if (pkgs.workspace) {
    for (const pk of libraryPkgs) if (pk.rel !== 'package.json') npmLib.push(`${pk.rel}: workspace library`);
  }
  add('library/sdk', 'npm-library', npmLib);
  if (py.present && !py.scripts && py.name && !(pyRuntimeEntry && pyServer.length > 0) && !rootDockerfile && pyUi.length === 0) add('library/sdk', 'python-library', [`python package ${py.name} without console scripts`]);
  const compiledLib = [];
  const rustMainsAny = rustMains.length > 0 || rustBins.length > 0;
  if (cargo.present && (cargo.lib || (readable.some((f) => /(^|\/)src\/lib\.rs$/.test(f.rel)) && !rustMainsAny && !cargo.bin))) compiledLib.push(cargo.lib ? 'Cargo.toml:[lib]' : 'src/lib.rs');
  if (gomod.present && compiledCli.length === 0 && serverLibs.length === 0 && readable.some((f) => f.ext === '.go')) compiledLib.push('go.mod without main.go/cmd/');
  if (rootFiles.some((f) => f.base === 'Package.swift')) compiledLib.push('Package.swift');
  compiledLib.push(...byBase(/\.podspec$/i, rootFiles));
  if (pom !== '' && serverLibs.every((e) => !/pom\.xml|build\.gradle/.test(e)) && compiledCli.every((e) => !/pom\.xml|build\.gradle/.test(e))
    && !/spring-boot-maven-plugin|mainClass|Main-Class|<packaging>(war|ear)<\/packaging>|application\s*\{|com\.android\.application|plugins\s*\{[^}]*\bapplication\b/.test(pom)
    && readable.some((f) => ['.java', '.kt', '.scala', '.groovy'].includes(f.ext))) compiledLib.push(/com\.android\.library/.test(pom) ? 'build.gradle:com.android.library' : 'pom.xml|build.gradle: jar without Spring/mainClass');
  if (/"type"\s*:\s*"library"/.test(composer)) compiledLib.push('composer.json:type=library');
  if (pubspec !== '' && readable.some((f) => f.ext === '.dart' && /^lib(\/|$)/.test(f.dir)) && !['ios', 'android', 'web', 'macos', 'windows', 'linux'].some((d) => rootHasDir(dirs, d)) && !/^executables:\s*$/m.test(pubspec)) compiledLib.push('pubspec.yaml package (lib/, no platform dirs)');
  add('library/sdk', 'compiled-library', compiledLib);
  add('library/sdk', 'gemspec', gemspecs.map((f) => f.rel));
  const pluginHosts = libraryPkgs.flatMap((pk) => [...FRONTEND_FRAMEWORKS, ...SERVER_FRAMEWORKS.npm].filter((d) => pk.peer.has(d)).map((d) => `${pk.rel}:peerDependencies.${d}`));
  add('library/sdk', 'framework-plugin', pluginHosts);
  const publish = [];
  for (const pk of libraryPkgs) for (const k of ['peerDependencies', 'publishConfig', 'files', 'types', 'typings']) if (pk.json[k] !== undefined) publish.push(`${pk.rel}:${k}`);
  if (rootFiles.some((f) => f.base === 'index.d.ts')) publish.push('index.d.ts');
  if (py.buildSystem && !py.scripts) publish.push('pyproject.toml:[build-system]');
  add('library/sdk', 'publish-signals', publish);
  const exampleEvidence = [];
  if (hasCode && rootHasDir(dirs, 'examples') && rootFiles.some((f) => /^readme(\.|$)/i.test(f.base))) exampleEvidence.push('examples/ + README');
  if (feExample.length > 0 && !frontendPresent) exampleEvidence.push(...feExample.map((e) => `${e} (sample app)`));
  add('library/sdk', 'examples-dir', exampleEvidence);

  add('data/ml', 'notebooks', notebooks);
  if (rootHasDir(dirs, 'notebooks')) add('data/ml', 'notebooks-dir', ['notebooks/']);
  const datasetFiles = readable.filter((f) => DATASET_EXTENSIONS.includes(f.ext)).map((f) => f.rel);
  if (hasCode) {
    if (rootHasDir(dirs, 'data')) add('data/ml', 'data-dir', ['data/']);
    add('data/ml', 'dataset-files', datasetFiles);
  }
  const dataLibs = [
    ...DATA_LIBRARIES.python.filter((d) => py.deps.has(d)).map((d) => `python:${d}`),
    ...pkgEvidence(appPkgs, DATA_LIBRARIES.npm),
  ];
  const mlFiles = [];
  if (hasCode) {
    mlFiles.push(...byBase(/^dvc\.ya?ml$|\.dvc$|^MLproject$|^environment\.ya?ml$|^conda\.ya?ml$/));
    const modelArtefacts = filesIn(readable, 'models').filter((f) => MODEL_ARTEFACT_EXTENSIONS.includes(f.ext));
    if (rootHasDir(dirs, 'models') && (modelArtefacts.length > 0 || notebooks.length > 0 || dataLibs.length > 0 || mlFiles.length > 0)) mlFiles.push('models/');
  }
  add('data/ml', 'ml-pipeline-files', mlFiles);
  add('data/ml', 'data-library', dataLibs);

  for (const f of readable) if (TEXT_EXTENSIONS_FOR_LINKS.includes(f.ext) && f.size > MAX_TEXT_BYTES) rd.limits.oversized_files.add(f.rel);
  const linkCandidates = readable
    .filter((f) => TEXT_EXTENSIONS_FOR_LINKS.includes(f.ext) && f.size <= MAX_TEXT_BYTES)
    .sort((a, b) => {
      const pri = (f) => (f.depth === 1 ? 0 : /^(design|mocks|docs|mockups|wireframes)\//.test(f.rel) ? 1 : 2);
      return pri(a) - pri(b) || a.depth - b.depth || (a.rel < b.rel ? -1 : 1);
    });
  if (linkCandidates.length > MAX_LINK_FILES) rd.limits.link_files_skipped = linkCandidates.length - MAX_LINK_FILES;
  const linkFiles = linkCandidates.slice(0, MAX_LINK_FILES);
  const figma = [];
  for (const f of linkFiles) {
    const txt = rd.readText(f.rel);
    if (txt === null) continue;
    const found = txt.match(FIGMA_LINK_RE);
    if (found) figma.push(`${f.rel}: ${found[0]}`);
  }
  add('mocks/design', 'figma-link', figma);
  const mocksDir = filesIn(readable, 'mocks');
  if (mocksDir.length > 0) add('mocks/design', 'mocks-dir', ['mocks/']);
  add('mocks/design', 'design-files', readable.filter((f) => DESIGN_EXTENSIONS.includes(f.ext)).map((f) => f.rel));
  const designDirs = ['design', 'designs', 'mockups', 'wireframes', 'prototypes', 'figma'].filter((d) => rootHasDir(dirs, d));
  add('mocks/design', 'design-dir', designDirs.map((d) => `${d}/`));

  const mdFiles = readable.filter((f) => /\.(md|mdx|markdown|rst|adoc|txt)$/i.test(f.base));
  const documentFiles = readable.filter((f) => /\.(pdf|docx|pptx|xlsx|epub|odt)$/i.test(f.base));
  const hasDesign = figma.length > 0 || mocksDir.length > 0 || readable.some((f) => DESIGN_EXTENSIONS.includes(f.ext));
  if (rootHasDir(dirs, 'docs') || rootHasDir(dirs, 'doc')) add('files/docs', 'docs-dir', [rootHasDir(dirs, 'docs') ? 'docs/' : 'doc/']);
  add('files/docs', 'document-files', documentFiles.map((f) => f.rel));

  if (backendRuntime && !frontendPresent && rootHost === null && hostedPkgs.length === 0 && hasCode) add('api/backend', 'no-frontend-framework', ['backend runtime present; no frontend framework, no templates, no HTML entry']);
  const runnableMatched = matched.some((m) => RUNNABLE_CLASSES.includes(m.class));
  if (!runnableMatched && !hasUiOrCode && !hasDesign && datasetFiles.length === 0 && mdFiles.length + documentFiles.length > 0) {
    add('files/docs', 'only-md', [`${mdFiles.length} markdown/text file(s), ${documentFiles.length} document(s), ${readable.length - mdFiles.length - documentFiles.length} other non-code file(s), no code/UI/design/datasets`]);
  }
  if (!runnableMatched && !hasUiOrCode && !hasDesign && datasetFiles.length > 0) {
    add('files/docs', 'datasets-only', cap(datasetFiles));
  }

  return {
    matched,
    facts: {
      has_code: hasCode,
      has_ui_or_code: hasUiOrCode,
      has_design: hasDesign,
      runnable_artefact: matched.some((m) => RUNNABLE_CLASSES.includes(m.class) && !['dockerfile', 'api-schema-files', 'no-frontend-framework', 'frontend-tooling', 'static-site-assets', 'docs-site', 'cli-extras', 'publish-signals', 'examples-dir', 'data-dir', 'ml-pipeline-files', 'data-library', 'compiled-library', 'npm-library', 'python-library', 'framework-plugin', 'gemspec'].includes(m.id)),
      code_files: codeFiles.length,
      code_extensions: [...new Set(codeFiles.map((f) => f.ext || f.base))].sort().slice(0, 12),
      markdown_files: mdFiles.length,
      dataset_files: datasetFiles.length,
      ui_host: rootHost ?? (hostedPkgs[0]?.host ?? null),
      hosted_packages: hostedPkgs.map((p) => `${p.rel}:${p.host}`),
      manifests: {
        'package.json': pkgs.all.length,
        python: py.present,
        'Cargo.toml': cargo.present,
        'go.mod': gomod.present,
        Gemfile: gemfile !== '',
        'composer.json': composer !== '',
        'pubspec.yaml': pubspec !== '',
        gemspec: gemspecs.length,
      },
    },
  };
}

export function tierOf(cls, signalIds = [], allIds = signalIds) {
  if (UI_CLASSES.includes(cls)) {
    const ui = signalIds.filter((id) => UI_SIGNALS.includes(id));
    const onlyUrl = ui.length > 0 && ui.every((id) => id === 'declared-url');
    const strongRunnable = allIds.some((id) => STRONG_RUNNABLE_SIGNALS.includes(id));
    if (ui.length > 0 && !(onlyUrl && strongRunnable)) return 'ui';
    if (onlyUrl && strongRunnable) return 'declared';
  }
  if (RUNNABLE_CLASSES.includes(cls)) return 'runnable';
  return 'concept';
}

export function scoreClasses(matched) {
  const byClass = new Map(CLASSES.map((c) => [c, { class: c, score: 0, tier: null, signals: [] }]));
  for (const m of matched) {
    const c = byClass.get(m.class);
    c.score += m.weight;
    c.signals.push(m.id);
  }
  const allIds = matched.map((m) => m.id);
  for (const c of byClass.values()) c.tier = tierOf(c.class, c.signals, allIds);
  const rank = { ui: 0, runnable: 1, declared: 2, concept: 3 };
  const order = (c) => CLASSES.indexOf(c);
  const evidence = (c) => c.signals.filter((id) => SECONDARY_EVIDENCE.includes(id)).length;
  return [...byClass.values()]
    .filter((c) => c.score > 0)
    .sort((a, b) => rank[a.tier] - rank[b.tier] || b.score - a.score || evidence(b) - evidence(a) || order(a.class) - order(b.class));
}

export function assessConfidence(candidates, facts = {}) {
  if (candidates.length === 0) return { confidence: 'low', ambiguous: true, margin: null };
  const top = candidates[0];
  const sameTier = candidates.slice(1).filter((c) => c.tier === top.tier);
  const runnerUp = sameTier[0];
  const margin = runnerUp ? top.score - runnerUp.score : top.score;
  if (top.tier === 'concept' && facts.has_ui_or_code) return { confidence: 'low', ambiguous: true, margin };
  if (top.score >= 4 && margin >= 2) return { confidence: 'high', ambiguous: false, margin };
  if (top.score >= 3) return { confidence: 'medium', ambiguous: true, margin };
  return { confidence: 'low', ambiguous: true, margin };
}

export function secondaryClasses(candidates) {
  const top = candidates[0];
  return candidates.slice(1)
    .filter((c) => c.score >= 2
      && c.signals.some((id) => SECONDARY_EVIDENCE.includes(id) && !(id === 'docs-dir' && top?.tier === 'ui'))
      && (!UI_CLASSES.includes(c.class) || c.tier === 'ui' || c.signals.includes('declared-url')))
    .map((c) => c.class);
}

export function scenesFor(surface, secondary = []) {
  const wanted = [surface, ...secondary].filter(Boolean);
  const chosen = [];
  const deferred = [];
  const pushScene = (s, forClass) => {
    if (chosen.some((c) => c.type === s.type) || deferred.some((c) => c.type === s.type)) return;
    const entry = { type: s.type, for: forClass, role: s.role, source: s.source, phase: s.phase };
    if (s.note) entry.note = s.note;
    if (s.phase === 'MVP') chosen.push(entry); else deferred.push(entry);
  };
  for (const cls of wanted) for (const s of SCENES) if (s.classes.includes(cls)) pushScene(s, cls);
  const outro = SCENES.find((s) => s.type === 'logo-outro');
  pushScene(outro, '*');
  const optional = SCENES.filter((s) => s.classes.includes('*') && s.type !== 'logo-outro' && !chosen.some((c) => c.type === s.type))
    .map((s) => ({ type: s.type, for: '*', role: s.role, source: s.source, phase: s.phase }));
  return { scenes: chosen, optional, deferred };
}

export function questionFor(candidates, confidence, facts = {}) {
  if (confidence === 'high') return null;
  const top = candidates.slice(0, 3).map((c) => c.class);
  const options = [...new Set([...top, ...CLASSES])].slice(0, 9);
  let lead;
  if (top.length === 0) lead = 'No product-type signal was found in the repository.';
  else if (candidates[0].tier === 'concept' && facts.has_ui_or_code) lead = `The repository holds code (${(facts.code_extensions || []).join(', ') || 'unrecognised manifest'}) that no signal recognised; only ${top.map((c) => `\`${c}\``).join(' / ')} evidence matched.`;
  else lead = `Detection is ${confidence}-confidence (${top.map((c) => `\`${c}\``).join(' vs ')}).`;
  return {
    field: 'surface',
    note: 'caps the interview at three — ask only when a slot is free',
    text: `${lead} Which best describes the product? ${options.map((c) => `\`${c}\``).join(', ')}`,
    options,
    default: top[0] ?? null,
  };
}

export function storySources(files, url) {
  const readable = files.filter((f) => !f.denied);
  const text = (f) => /\.(md|mdx|markdown|rst|txt|adoc|html|htm|json|ya?ml)$/i.test(f.base) || !f.base.includes('.');
  const out = [];
  if (url) out.push({ kind: 'hero-page', ref: url });
  for (const f of readable) if (f.depth === 1 && /^readme(\.|$)/i.test(f.base)) out.push({ kind: 'readme', ref: f.rel });
  for (const f of readable) if (f.depth <= 2 && /^(changelog|changes|history|releases)(\.|$)/i.test(f.base) && text(f)) out.push({ kind: 'changelog', ref: f.rel });
  for (const f of readable) if (/(^|\/)(testimonials?|customers?|case-stud(y|ies))(\/|\.|$)/i.test(f.rel) && text(f)) out.push({ kind: 'testimonials', ref: f.rel });
  for (const f of readable) if (/(^|\/)(e2e|cypress|playwright|integration)\//i.test(f.rel) && /\.(spec|test)\.[jt]sx?$|\.cy\.[jt]s$|_test\.py$|^test_.*\.py$/i.test(f.base)) out.push({ kind: 'e2e-tests', ref: f.rel });
  return cap(out, 40);
}

export function buildProfile(repo, { url = null, maxFiles = 20000, maxDepth = 8 } = {}) {
  const walk = walkRepo(repo, { maxFiles, maxDepth });
  const rd = makeReader(repo);
  const { matched, facts } = evaluateSignals({ rd, files: walk.files, dirs: walk.dirs, url });
  const candidates = scoreClasses(matched);
  const { confidence, ambiguous, margin } = assessConfidence(candidates, facts);
  const surface = candidates.length > 0 ? candidates[0].class : null;
  const secondary = secondaryClasses(candidates);
  const plan = scenesFor(surface, secondary);
  const mode = (facts.has_ui_or_code || facts.runnable_artefact) ? 'product' : surface ? 'concept' : 'unknown';
  const capture = surface ? CAPTURE_BY_CLASS[surface] : null;
  const limitsHit = Object.fromEntries(Object.entries(rd.limits)
    .map(([k, v]) => [k, v instanceof Set ? [...v].sort() : v])
    .filter(([, v]) => (Array.isArray(v) ? v.length > 0 : v > 0)));
  const truncated = walk.truncated || walk.unreadable.length > 0 || Object.keys(limitsHit).length > 0;
  const notes = [];
  if (mode === 'concept') notes.push('Concept-video mode: the repository holds neither UI nor runnable code — the plugin must say so to the user explicitly; design frames carry "Design preview" and never count as the tier-A product scene.');
  if (mode === 'product' && surface && CONCEPT_CLASSES.includes(surface)) notes.push(`Code is present (${facts.code_files} file(s): ${facts.code_extensions.join(', ')}) but no class signal recognised it (language or manifest not covered) — confidence forced to low; ask the question, the concept classes hold only the design/document scenes.`);
  if (surface === null) notes.push(facts.has_code
    ? `Code is present (${facts.code_files} file(s): ${facts.code_extensions.join(', ')}) but no class signal recognised it (language or manifest not covered) — ask the question (when a slot is free) or run with --url / an explicit class.`
    : 'No signal matched: ask the question (when a slot is free) or run with --url / an explicit class.');
  if (surface && surface !== 'web-ui') notes.push('Product without UI: no URL is required; Chrome is needed only at render.');
  if (surface === 'web-ui' && candidates[0].tier === 'runnable') notes.push('web-ui leads on weak evidence only (tooling, plain HTML or a docs site) — no frontend framework, template set or HTML entry was found.');
  if (url && surface !== 'web-ui' && candidates.some((c) => c.class === 'web-ui')) notes.push(`--url ${url} is recorded as a secondary web surface: the repository's own signals (${candidates[0].signals.join(', ')}) point at \`${surface}\` (confirm with the question rather than flipping the class).`);
  if (walk.truncated) notes.push(`Walk truncated at --max-files ${maxFiles} / --max-depth ${maxDepth}; signals may be incomplete.`);
  if (Object.keys(limitsHit).length > 0) notes.push(`Reader limits hit (${Object.keys(limitsHit).join(', ')}); signals may be incomplete.`);
  if (walk.unreadable.length > 0) notes.push(`Unreadable directories skipped: ${walk.unreadable.slice(0, 5).join(', ')}${walk.unreadable.length > 5 ? ', …' : ''}; signals may be incomplete.`);
  for (const cls of [surface, ...secondary]) if (cls && SIGNALS[cls].note) notes.push(SIGNALS[cls].note);

  return {
    schema: PROFILE_SCHEMA,
    plugin_version: PLUGIN_VERSION,
    repo,
    url,
    surface,
    confidence,
    ambiguous,
    mode,
    candidates: candidates.map((c) => ({ class: c.class, score: c.score, tier: c.tier, signals: c.signals })),
    secondary,
    margin,
    signals: matched,
    scenes: plan.scenes,
    optional_scenes: plan.optional,
    deferred_scenes: plan.deferred,
    capture: capture ? { class: surface, ...capture } : null,
    question: questionFor(candidates, confidence, facts),
    story_sources: storySources(walk.files, url),
    facts,
    read_policy: {
      rules: READ_DENY.map((r) => r.id),
      denied_files_seen: walk.skipped,
      content_read: [...rd.opened].sort(),
      content_read_total: rd.opened.size,
    },
    scan: {
      files: walk.files.length,
      dirs: walk.dirs.length,
      truncated,
      max_files: maxFiles,
      max_depth: maxDepth,
      ignored_dirs: walk.ignored,
      unreadable_dirs: walk.unreadable,
      limits_hit: limitsHit,
    },
    notes,
  };
}

function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    console.error(String(err.message));
    console.error(USAGE);
    return 2;
  }
  if (opts.help) { console.log(USAGE); return 0; }
  if (opts.listSignals) { console.log(JSON.stringify({ classes: CLASSES, signals: SIGNALS, read_deny: READ_DENY.map((r) => ({ id: r.id, source: r.source })) }, null, 2)); return 0; }
  if (opts.listScenes) { console.log(JSON.stringify({ scenes: SCENES, capture: CAPTURE_BY_CLASS }, null, 2)); return 0; }

  try {
    if (!fs.statSync(opts.repo).isDirectory()) throw new Error('not a directory');
    fs.readdirSync(opts.repo);
  } catch {
    console.error(`inspect-project: --repo is not a readable directory: ${opts.repo}`);
    return 1;
  }
  const profile = buildProfile(opts.repo, { url: opts.url, maxFiles: opts.maxFiles, maxDepth: opts.maxDepth });
  const json = JSON.stringify(profile, null, 2);
  if (opts.out !== '-') {
    try {
      fs.mkdirSync(path.dirname(path.resolve(opts.out)), { recursive: true });
      fs.writeFileSync(path.resolve(opts.out), `${json}\n`);
    } catch (err) {
      console.error(`inspect-project: cannot write ${opts.out}: ${err.message}`);
      return 1;
    }
  }
  if (opts.print || opts.out === '-') console.log(json);
  const summary = profile.surface
    ? `surface=${profile.surface} confidence=${profile.confidence}${profile.secondary.length ? ` secondary=${profile.secondary.join(',')}` : ''} mode=${profile.mode}`
    : `surface=null confidence=${profile.confidence} mode=${profile.mode}`;
  console.error(`inspect-project: ${summary}${profile.ambiguous ? ' — ambiguous (question in the profile)' : ''}${opts.out !== '-' ? ` → ${opts.out}` : ''}`);
  return 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) process.exit(main(process.argv.slice(2)));
