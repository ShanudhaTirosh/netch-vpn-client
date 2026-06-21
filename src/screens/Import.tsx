import { useState } from 'react';
import { readText } from '@tauri-apps/plugin-clipboard-manager';
import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile, readFile } from '@tauri-apps/plugin-fs';
import jsQR from 'jsqr';
import { useStore } from '@/store/store';
import { MANUAL_GROUP_ID } from '@/types';

export default function Import() {
  const { importFrom, addSubscription } = useStore();
  const [text, setText] = useState('');
  const [subName, setSubName] = useState('');
  const [subUrl, setSubUrl] = useState('');
  const [msg, setMsg] = useState('');

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000); };

  const doImport = (t: string) => {
    if (!t.trim()) return flash('Nothing to import');
    const r = importFrom(t, MANUAL_GROUP_ID);
    flash(`Imported ${r.added} profile(s)${r.issues ? `, ${r.issues} line(s) skipped` : ''}`);
  };

  const fromClipboard = async () => { try { doImport((await readText()) || ''); } catch { flash('Clipboard read failed'); } };

  const fromFile = async () => {
    const path = await open({ multiple: false, filters: [{ name: 'Configs', extensions: ['json', 'txt', 'yaml', 'yml'] }] });
    if (typeof path === 'string') doImport(await readTextFile(path));
  };

  const fromQrImage = async () => {
    const path = await open({ multiple: false, filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'bmp'] }] });
    if (typeof path !== 'string') return;
    // Decode the QR via canvas + jsQR.
    const bytes = await readFile(path);
    const blob = new Blob([bytes]);
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d')!; ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height);
      const code = jsQR(data.data, c.width, c.height);
      URL.revokeObjectURL(url);
      if (code?.data) doImport(code.data); else flash('No QR code found in image');
    };
    img.src = url;
  };

  return (
    <div className="content">
      <h2 className="h1">Import</h2>

      <div className="card">
        <div className="row" style={{ gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <button className="btn primary" onClick={fromClipboard}>⧉ Import from Clipboard</button>
          <button className="btn" onClick={fromFile}>📄 Import file (.json/.txt/.yaml)</button>
          <button className="btn" onClick={fromQrImage}>▦ Import QR image</button>
        </div>
        <textarea className="in" placeholder="Paste share links, a base64 subscription, Clash YAML, or sing-box JSON here…" value={text} onChange={(e) => setText(e.target.value)} />
        <div style={{ marginTop: 10 }}><button className="btn primary" onClick={() => doImport(text)}>Parse & import</button></div>
        <div style={{ color: 'var(--dim)', fontSize: 12, marginTop: 8 }}>
          Detects: single link · newline list · base64 subscription · Clash/Mihomo YAML · sing-box JSON.
          Protocols: VLESS, VMess, Trojan, Shadowsocks, Hysteria2, TUIC (+ WireGuard via JSON/YAML).
          Blank/comment lines ignored; bad lines reported, not fatal.
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Add subscription (auto-update)</h3>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <input className="in" style={{ flex: '1 1 160px' }} placeholder="Name (e.g. Netch SG)" value={subName} onChange={(e) => setSubName(e.target.value)} />
          <input className="in" style={{ flex: '2 1 280px' }} placeholder="https://…/sub" value={subUrl} onChange={(e) => setSubUrl(e.target.value)} />
          <button className="btn primary" onClick={async () => { if (subUrl) { await addSubscription(subName || 'Subscription', subUrl); setSubName(''); setSubUrl(''); flash('Subscription added & fetched'); } }}>Add</button>
        </div>
      </div>

      {msg && <div className="toast">{msg}</div>}
    </div>
  );
}
