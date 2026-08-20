# План: корректный визуал мишени ISSF 10м пистолет

## Проблема

Текущая реализация `TargetCanvas.tsx` рисует мишень в режиме «зебра» — кольца чередуются чёрный/белый от внешнего к внутреннему. Это не соответствует реальной мишени ISSF.

---

## Эталонный визуал ISSF 10м Air Pistol

### Цветовая схема (от центра наружу)

| Зона | Кольца | Заливка | Описание |
|------|--------|---------|----------|
| Центральная белая точка | внутри 10 | белый | Inner ten marker |
| Чёрная зона | 10, 9, 8, 7 | чёрный фон | Единая чёрная область; внешняя граница = кольцо 7 |
| Белые кольца | 6, 5, 4, 3, 2, 1 | белый фон | Белые кольца с чёрными линиями границ |

### Точная геометрия (диаметры, PLAN §14)

```
Кольцо 1:  d = 155.5 мм  — внешняя граница зачётной зоны
Кольцо 2:  d = 139.5 мм
Кольцо 3:  d = 123.5 мм
Кольцо 4:  d = 107.5 мм
Кольцо 5:  d =  91.5 мм
Кольцо 6:  d =  75.5 мм
Кольцо 7:  d =  59.5 мм  ← внешняя граница чёрной зоны
Кольцо 8:  d =  43.5 мм  ← внутри чёрной зоны
Кольцо 9:  d =  27.5 мм  ← внутри чёрной зоны
Кольцо 10: d =  11.5 мм  ← внутри чёрной зоны
Inner ten: d =   5.0 мм  ← белая точка в центре
```

### Алгоритм отрисовки (SVG, от дальнего к ближнему)

1. **Белый фон** — `<circle r=80 fill="white" stroke="black" strokeWidth=0.3/>`
2. **Чёрная зона** — `<circle r=29.75 fill="black"/>` (r = 59.5/2 = 29.75 мм)
3. **Линии колец 6–1** — `<circle r=... fill="none" stroke="black" strokeWidth=0.3/>` для каждого кольца 1–6
4. **Линии колец 9, 8 внутри чёрной зоны** — `<circle r=... fill="none" stroke="white" strokeWidth=0.3/>`
5. **Линия кольца 10** — `<circle r=5.75 fill="none" stroke="white" strokeWidth=0.3/>`
6. **Белая точка inner ten** — `<circle r=2.5 fill="white"/>` (r = 5.0/2 = 2.5 мм)
7. **Метки колец** — `<text>` по 4 сторонам (сверху, снизу, слева, справа)

### Метки колец

Числа 1–9 печатаются **по центру полосы** соответствующего кольца по 4 направлениям
(сверху, снизу, слева, справа). Кольцо 10 — без метки (собственной полосы не имеет).

Позиции меток (по вертикальной оси, сверху):
- Число `N` размещается по центру полосы между границей кольца N и границей кольца N+1:
  `r = (RING_D[N] / 2 + RING_D[N + 1] / 2) / 2 = RING_D[N] / 2 - 4`
  (в `zoom7` радиус умножается на `ZOOM7_SCALE`)
- Все четыре направления используют `textAnchor="middle"` и `dominantBaseline="central"`;
  направление меняет только знак координат
- `fontSize ≈ 3.5` (в единицах viewBox = мм); в `zoom7` — `5`
- Цвет: кольца 7–9 → `white` (метки внутри чёрной зоны), кольца 1–6 → `black`

---

## Изменения в коде

### Файл: `src/components/TargetCanvas.tsx`

**Заменить блок `{/* Rings from outside in */}`** на новую логику:

```tsx
{/* 1. White background circle */}
<circle cx={CENTER} cy={CENTER} r={80} fill="white" stroke="#222" strokeWidth={0.3} />

{/* 2. Black zone (rings 7–10): fill from ring-7 boundary inward */}
<circle cx={CENTER} cy={CENTER} r={29.75} fill="black" />

{/* 3. Ring boundary lines for outer white rings (1–6): black stroke, no fill */}
{[155.5, 139.5, 123.5, 107.5, 91.5, 75.5].map((d, i) => (
  <circle key={i} cx={CENTER} cy={CENTER} r={d/2}
    fill="none" stroke="#222" strokeWidth={0.3} />
))}

{/* 4. Ring boundary lines inside black zone (8, 9): white stroke */}
{[43.5, 27.5].map((d, i) => (
  <circle key={i} cx={CENTER} cy={CENTER} r={d/2}
    fill="none" stroke="white" strokeWidth={0.3} />
))}

{/* 5. Ring 10 boundary line: white stroke */}
<circle cx={CENTER} cy={CENTER} r={5.75}
  fill="none" stroke="white" strokeWidth={0.3} />

{/* 6. Inner ten white dot */}
<circle cx={CENTER} cy={CENTER} r={2.5} fill="white" />

{/* 7. Ring labels: 1–9, 4 directions */}
{RING_LABELS.map(({ n, r, color }) =>
  LABEL_DIRS.map(([dx, dy]) => (
    <text key={`${n}-${dx}-${dy}`}
      x={CENTER + dx * r} y={CENTER + dy * r}
      fontSize={3.5} fill={color}
      textAnchor="middle" dominantBaseline="central"
      style={{ userSelect: 'none', pointerEvents: 'none' }}
    >{n}</text>
  ))
)}}
```

**Добавить константы меток:**

```tsx
// Labels: ring number, radius (mm) = center of the band between ring n and
// ring n + 1; text color (white inside the black zone, black outside)
const RING_LABELS = [
  { n: 9, r: (27.5/2 + 11.5/2) / 2,  color: 'white' },  // inside black zone
  { n: 8, r: (43.5/2 + 27.5/2) / 2,  color: 'white' },
  { n: 7, r: (59.5/2 + 43.5/2) / 2,  color: 'white' },
  { n: 6, r: (75.5/2 + 59.5/2) / 2,  color: 'black' },
  { n: 5, r: (91.5/2 + 75.5/2) / 2,  color: 'black' },
  { n: 4, r: (107.5/2 + 91.5/2) / 2, color: 'black' },
  { n: 3, r: (123.5/2 + 107.5/2) / 2, color: 'black' },
  { n: 2, r: (139.5/2 + 123.5/2) / 2, color: 'black' },
  { n: 1, r: (155.5/2 + 139.5/2) / 2, color: 'black' },
];

// [dx, dy]; direction only changes the sign of the coordinate offset
const LABEL_DIRS = [
  [0, -1],  // top
  [0,  1],  // bottom
  [-1, 0],  // left
  [1,  0],  // right
] as const;
```

---

## Что НЕ меняется

- Логика pointer events — без изменений
- Маркеры выстрелов — без изменений
- `src/scoring.ts`, `src/transform.ts`, `src/db/`, `src/domain/` — не трогать
- Тесты — без изменений (это чисто визуальное изменение)

---

## Критерий приёмки

После изменения мишень визуально должна соответствовать:
- Белый фон кольца 1 (outer)
- Чёрная сплошная заливка от кольца 7 до центра
- Белая точка в центре (inner ten)
- Белые линии колец 8, 9, 10 внутри чёрной зоны
- Чёрные линии колец 1–6 на белом фоне
- Цифры 1–9 по 4 сторонам, белые внутри чёрной зоны, чёрные снаружи
- `npm run build` без ошибок
- Все 254 теста зелёные
