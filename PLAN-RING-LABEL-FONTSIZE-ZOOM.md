# PLAN: Ring Label Font Size Scale with Zoom

## Задача
Цифры на мишени должны масштабироваться вместе с зумом — выглядеть одинаково крупно и в full, и в zoom7 режиме.

## Проблема
В full-view `ZOOM_SCALE = 1`, в zoom7 `ZOOM_SCALE ≈ 2.74` (80 / 29.25).
Позиции меток уже умножаются на ZOOM_SCALE (через `r`), но `fontSize` фиксирован = `7`.
В zoom7 физические единицы viewBox растянуты в ~2.74 раза, поэтому цифра выглядит маленькой.

## Изменение
Файл: `src/components/TargetCanvas.tsx`

Строка ~253:
```tsx
fontSize={7}
```
заменить на:
```tsx
fontSize={7 / ZOOM_SCALE}
```

`ZOOM_SCALE` уже доступен в scope (строка ~82). В full-view = 7/1 = 7 (без изменений). В zoom7 = 7/2.74 ≈ 2.55 (визуально такой же размер на экране).

## Что НЕ меняется
- Логика scoring/transform/DB
- Позиционирование меток, цвета
- Маркеры выстрелов

## Acceptance criteria
- [ ] В full-view цифры такого же размера как сейчас (fontSize = 7)
- [ ] В zoom7 цифры визуально того же размера что в full-view (fontSize ≈ 2.55)
- [ ] `npm test` — green (254 tests)
- [ ] `npm run build` — успешно

## Rollback
Вернуть `fontSize={7}`.
