import React from 'react';
import s from './UpdateBanner.module.css';

interface Props {
  onUpdate: () => void;
  onDismiss: () => void;
}

export default function UpdateBanner({ onUpdate, onDismiss }: Props) {
  return (
    <div className={s.banner}>
      <span className={s.text}>Доступно обновление приложения</span>
      <button className={s.btn} onClick={onUpdate}>Обновить</button>
      <button className={s.dismiss} onClick={onDismiss} aria-label="Закрыть">✕</button>
    </div>
  );
}
