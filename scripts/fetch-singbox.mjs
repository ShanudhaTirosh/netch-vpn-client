// Downloads the official sing-box release and places it as a Tauri sidecar
// binary named with the Rust target triple (what externalBin expects):
//   src-tauri/binaries/sing-box-<triple>(.exe)
// Usage: node scripts/fetch-singbox.mjs [version]   (default: latest stable)
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, chmodSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const VERSION = process.argv[2] || '1.11.0'; // pin a known-good sing-box; bump deliberately
const OUT = join(process.cwd(), 'src-tauri', 'binaries');
mkdirSync(OUT, { recursive: true });

// host platform → { singbox asset arch/os, rust target triple, exe suffix }
function hostTarget() {
  const p = process.platform, a = process.arch;
  if (p === 'win32') return { os: 'windows', arch: a === 'arm64' ? 'arm64' : 'amd64', triple: a === 'arm64' ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-msvc', ext: '.exe', archive: 'zip' };
  if (p === 'darwin') return { os: 'darwin', arch: a === 'arm64' ? 'arm64' : 'amd64', triple: a === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin', ext: '', archive: 'tar.gz' };
  return { os: 'linux', arch: a === 'arm64' ? 'arm64' : 'amd64', triple: a === 'arm64' ? 'aarch64-unknown-linux-gnu' : 'x86_64-unknown-linux-gnu', ext: '', archive: 'tar.gz' };
}

const t = hostTarget();
const name = `sing-box-${VERSION}-${t.os}-${t.arch}`;
const url = `https://github.com/SagerNet/sing-box/releases/download/v${VERSION}/${name}.${t.archive}`;
const dest = join(OUT, `sing-box-${t.triple}${t.ext}`);

if (existsSync(dest)) { console.log(`[fetch-singbox] already present: ${dest}`); process.exit(0); }

console.log(`[fetch-singbox] downloading ${url}`);
const tmp = join(tmpdir(), `${name}.${t.archive}`);

try {
  // Use curl (present on Win10+/macOS/Linux) to avoid extra deps.
  execSync(`curl -fsSL "${url}" -o "${tmp}"`, { stdio: 'inherit' });
  const work = join(tmpdir(), `singbox-extract-${Date.now()}`);
  mkdirSync(work, { recursive: true });
  if (t.archive === 'zip') {
    execSync(process.platform === 'win32'
      ? `powershell -Command "Expand-Archive -Force '${tmp}' '${work}'"`
      : `unzip -o "${tmp}" -d "${work}"`, { stdio: 'inherit' });
  } else {
    execSync(`tar -xzf "${tmp}" -C "${work}"`, { stdio: 'inherit' });
  }
  const bin = join(work, name, `sing-box${t.ext}`);
  const buf = await import('node:fs').then((fs) => fs.readFileSync(bin));
  writeFileSync(dest, buf);
  if (t.os !== 'windows') chmodSync(dest, 0o755);
  console.log(`[fetch-singbox] placed sidecar: ${dest}`);
} catch (e) {
  console.error('[fetch-singbox] failed:', e.message);
  console.error('Download sing-box manually and place it at:', dest);
  process.exit(1);
}
