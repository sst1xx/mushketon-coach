# PLAN: Shot Marker Color Redesign

## Задача
Изменить цвет маркеров выстрелов согласно новому дизайну:
- Обычный выстрел: внутренний круг **чёрный**, обводка **белая**, цифра **белая**
- Активный выстрел (последний / перетаскиваемый): внутренний круг **зелёный**, обводка **белая**, цифра **белая**

## Файл
`src/components/TargetCanvas.tsx`, строки ~275–282

## Текущие значения
```ts
const fillColor   = isDragging ? '#FF6B00' : isLast ? '#FFD700' : 'white';
const strokeColor = isDragging || isLast ? 'white' : 'black';
const textFill    = isDragging ? 'white' : '#333';
// outer circle: stroke="black"
```

## Новые значения
```ts
const fillColor   = isDragging || isLast ? '#22C55E' : 'black';
const strokeColor = 'white';
const textFill    = 'white';
// outer circle: stroke="white"  ← изменить атрибут stroke у первого <circle>
```

`#22C55E` — зелёный (Tailwind green-500), хорошо читается на любом фоне мишени.

## Изменения в JSX
1. `fillColor` / `strokeColor` / `textFill` — три строки выше
2. Внешний circle: `stroke="black"` → `stroke="white"`

## Что НЕ меняется
- Размеры (rInner, rOuter, fontSize)
- Логика scoring/transform/DB
- Цвета колец и фона мишени

## Acceptance criteria
- [ ] Обычный выстрел: чёрный круг, белая обводка, белая цифра
- [ ] Активный (last/dragging): зелёный круг, белая обводка, белая цифра
- [ ] `npm test` — green (254 tests)
- [ ] `npm run build` — успешно

## Rollback
Вернуть исходные три строки и `stroke="black"` у outer circle.
