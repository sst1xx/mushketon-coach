# PLAN: Shot Marker Size ×1.3

## Задача
Увеличить маркер выстрела (кружок + цифра внутри) на 30%. Только визуальное изменение.

## Файл
`src/components/TargetCanvas.tsx`, строки ~273–275

## Текущие значения
```ts
const rInner  = isDragging || isLast ? 3.5 : 2.8;
const rOuter  = isDragging || isLast ? 4.0 : 3.3;
const fontSize = isDragging || isLast ? 2.8 : 2.4;
```

## Новые значения (×1.3, округление до 2 знаков)
```ts
const rInner  = isDragging || isLast ? 4.55 : 3.64;
const rOuter  = isDragging || isLast ? 5.20 : 4.29;
const fontSize = isDragging || isLast ? 3.64 : 3.12;
```

## Что НЕ меняется
- `strokeWidth` (0.6, 0.25) — не трогать
- Логика scoring/transform/DB
- Цвета, fill, stroke

## Acceptance criteria
- [ ] Маркеры выстрелов визуально крупнее на ~30%
- [ ] `npm test` — green (254 tests)
- [ ] `npm run build` — успешно

## Rollback
Вернуть исходные три строки.
