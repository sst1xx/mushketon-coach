# PLAN: Ring Label Font Size ×2

## Задача
Увеличить цифры на мишени в два раза — только визуальное изменение.

## Файл
`src/components/TargetCanvas.tsx`

## Изменение
Строка ~253: `fontSize={3.5}` → `fontSize={7}`

Это единственное изменение. Позиционирование меток (радиус `r`), логика scoring/transform/DB — не трогать.

## Acceptance criteria
- [ ] Цифры на мишени визуально в два раза крупнее (fontSize 3.5 → 7)
- [ ] Геометрия колец, цвета, логика — не изменены
- [ ] `npm test` — green (254 tests)
- [ ] `npm run build` — успешно

## Rollback
Вернуть `fontSize={3.5}`.
