import { useState, type ReactNode } from 'react';
import { useStore } from '@/store/store';
import type { Profile, ProfileConfig, Protocol, Security, Transport } from '@/types';

const PROTOCOLS: Protocol[] = ['vless', 'vmess', 'trojan', 'shadowsocks', 'hysteria2', 'tuic', 'wireguard'];
const TRANSPORTS: Transport[] = ['tcp', 'ws', 'grpc', 'http', 'httpupgrade', 'xhttp', 'none'];
const SECURITIES: Security[] = ['none', 'tls', 'reality'];

function Field({ label, hint, children, full }: { label: string; hint?: string; children: ReactNode; full?: boolean }) {
  return (
    <div className={`field ${full ? 'full' : ''}`}>
      <label>{label}</label>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export default function ProfileEditModal({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const updateProfile = useStore((s) => s.updateProfile);
  const [name, setName] = useState(profile.name);
  const [c, setC] = useState<ProfileConfig>({ ...profile.config });

  const set = (patch: Partial<ProfileConfig>) => setC((prev) => ({ ...prev, ...patch }));
  const isTls = c.security === 'tls' || c.security === 'reality';
  const showUuid = c.protocol === 'vless' || c.protocol === 'vmess' || c.protocol === 'tuic';
  const showPassword = c.protocol === 'trojan' || c.protocol === 'shadowsocks' || c.protocol === 'hysteria2' || c.protocol === 'tuic';

  const save = () => {
    updateProfile(profile.id, name.trim(), {
      ...c,
      port: Number(c.port) || 443,
      alpn: c.alpn,
    });
    onClose();
  };

  const alpnStr = (c.alpn || []).join(',');

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <h3>Edit profile</h3>
        <div className="sub">Manually adjust any field — useful to fix SNI, flow, port, or allow-insecure without re-importing.</div>

        <div className="form-grid">
          <Field label="Display name" full>
            <input className="in" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>

          <Field label="Protocol">
            <select className="in" value={c.protocol} onChange={(e) => set({ protocol: e.target.value as Protocol })}>
              {PROTOCOLS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Security">
            <select className="in" value={c.security} onChange={(e) => set({ security: e.target.value as Security })}>
              {SECURITIES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>

          <Field label="Server (address)">
            <input className="in" value={c.server} onChange={(e) => set({ server: e.target.value })} />
          </Field>
          <Field label="Port">
            <input className="in" type="number" value={c.port} onChange={(e) => set({ port: Number(e.target.value) })} />
          </Field>

          <Field label="Transport">
            <select className="in" value={c.transport} onChange={(e) => set({ transport: e.target.value as Transport })}>
              {TRANSPORTS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          {(c.protocol === 'vless') && (
            <Field label="Flow" hint="xtls-rprx-vision for REALITY/Vision; blank otherwise">
              <input className="in" value={c.flow || ''} onChange={(e) => set({ flow: e.target.value })} placeholder="xtls-rprx-vision" />
            </Field>
          )}

          {showUuid && (
            <Field label="UUID / ID" full={!showPassword}>
              <input className="in" value={c.uuid || ''} onChange={(e) => set({ uuid: e.target.value })} />
            </Field>
          )}
          {showPassword && (
            <Field label="Password" full={!showUuid}>
              <input className="in" value={c.password || ''} onChange={(e) => set({ password: e.target.value })} />
            </Field>
          )}
          {c.protocol === 'shadowsocks' && (
            <Field label="Method (cipher)">
              <input className="in" value={c.method || ''} onChange={(e) => set({ method: e.target.value })} />
            </Field>
          )}

          {isTls && (
            <>
              <Field label="SNI (server name)" hint="The TLS name sent — e.g. aka.ms for camouflage">
                <input className="in" value={c.sni || ''} onChange={(e) => set({ sni: e.target.value })} />
              </Field>
              <Field label="uTLS fingerprint">
                <input className="in" value={c.fingerprint || 'chrome'} onChange={(e) => set({ fingerprint: e.target.value })} />
              </Field>
              <Field label="ALPN" hint="comma separated, e.g. h2,http/1.1">
                <input className="in" value={alpnStr} onChange={(e) => set({ alpn: e.target.value.split(',').map((a) => a.trim()).filter(Boolean) })} />
              </Field>
            </>
          )}

          {c.security === 'reality' && (
            <>
              <Field label="REALITY public key (pbk)">
                <input className="in" value={c.publicKey || ''} onChange={(e) => set({ publicKey: e.target.value })} />
              </Field>
              <Field label="REALITY short id (sid)">
                <input className="in" value={c.shortId || ''} onChange={(e) => set({ shortId: e.target.value })} />
              </Field>
            </>
          )}

          {(c.transport === 'ws' || c.transport === 'xhttp' || c.transport === 'httpupgrade' || c.transport === 'http') && (
            <>
              <Field label="Path">
                <input className="in" value={c.path || ''} onChange={(e) => set({ path: e.target.value })} placeholder="/" />
              </Field>
              <Field label="Host header">
                <input className="in" value={c.host || ''} onChange={(e) => set({ host: e.target.value })} />
              </Field>
            </>
          )}
          {c.transport === 'grpc' && (
            <Field label="gRPC service name" full>
              <input className="in" value={c.serviceName || ''} onChange={(e) => set({ serviceName: e.target.value })} />
            </Field>
          )}

          {isTls && (
            <Field label="Allow insecure TLS" hint="Skip cert check — needed for SNI camouflage (cert ≠ SNI)" full>
              <div className={`switch ${c.allowInsecure ? 'on' : ''}`} onClick={() => set({ allowInsecure: !c.allowInsecure })}><i /></div>
            </Field>
          )}
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}
