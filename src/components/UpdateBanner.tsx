import React from 'react';

interface Props {
  onUpdate: () => void;
  onDismiss: () => void;
}

export default function UpdateBanner({ onUpdate, onDismiss }: Props) {
  return (
    <div style={s.banner}>
      <span style={s.text}>Доступно обновление приложения</span>
      <button style={s.btn} onClick={onUpdate}>Обновить</button>
      <button style={s.dismiss} onClick={onDismiss}>✕</button>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  banner:  { position: 'fixed', bottom: 0, left: 0, right: 0, background: '#1a1a2e', color: '#fff', display: 'flex', alignItems: 'center', padding: '12px 16px', gap: 12, zIndex: 200 },
  text:    { flex: 1, fontSize: 14 },
  btn:     { padding: '6px 14px', fontSize: 14, borderRadius: 5, border: 'none', background: '#fff', color: '#1a1a2e', cursor: 'pointer', fontWeight: 600 },
  dismiss: { background: 'none', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', padding: '0 4px' },
};
