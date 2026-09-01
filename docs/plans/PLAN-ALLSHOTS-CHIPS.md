# PLAN-ALLSHOTS-CHIPS: Мультиселект тренировок через чипы

## Задача
Заменить `<select>` на горизонтальный скролл-ряд чипов с мультиселектом тренировок
на экране «Все выстрелы» (`AllShotsScreen`).

## Решения (зафиксированы пользователем)

| Вопрос | Решение |
|---|---|
| Лимит 10 тренировок | Убрать — все тренировки доступны как чипы |
| Пустой выбор | Пустой Set = нет фильтра = показать все выстрелы. Чип [Все] подсвечен |
| Цвет маркеров | Один цвет (без разбивки по тренировкам) |
| Персист фильтра | Только `useState`, не IndexedDB |

## Поведение чипов

- Чип `[Все]` — всегда первый слева. Активен (подсвечен) когда `selectedTrainingIds` пуст.
  Тап на `[Все]` → сбросить `selectedTrainingIds` в пустой Set.
- Тренировочный чип — тап toggles id в Set.
  Тап на выбранный единственный чип → снимает выбор → Set пуст → показываются все.
- `selectedTrainingIds` пуст = нет фильтра = все выстрелы.
- Тренировки в чипах: все (без лимита), порядок — от новой к старой (как было в select).
- Компактный формат метки чипа: `21 июл`; при коллизии дат: `21 июл 14:30`.
  Счётчик выстрелов не показывать (экономим ширину).

## Подпись выбранного выстрела

- 1 тренировка выбрана или "Все" с 1 тренировкой: `№3 • 9.8` (как сейчас)
- 2+ тренировки в displayedEntries: `№3 (21 июл) • 9.8`
- Логику `formatShotLabel` вынести в `allShotsCaption.ts` (по конвенции проекта — чистые хелперы в отдельном файле).

## Изменяемые файлы

### 1. `src/screens/allShotsFilter.ts`
- Сигнатура: `filterAllShotsEntries(entries, trainingIds: ReadonlySet<string> | null)`
- `null` или `size === 0` → вернуть `entries` по ссылке (без копии).
- Несколько id → фильтр + ренумерация 1..N по отфильтрованному подмножеству.

### 2. `src/screens/allShotsFilter.test.ts`
- Обновить под новую сигнатуру.
- Добавить тест: Set с несколькими id.
- Добавить тест: пустой Set → возвращает все.

### 3. `src/screens/allShotsCaption.ts`
- Добавить `formatShotLabel(entry: AllShotsEntry | null, multiTraining: boolean): string`
  - `null` → `'–'`
  - `multiTraining=false` → `№N • X.X`
  - `multiTraining=true` → `№N (21 июл) • X.X`
- Существующий `formatCommentLine` не трогать.

### 4. `src/screens/allShotsCaption.test.ts`
- Тесты для `formatShotLabel`.

### 5. `src/screens/AllShotsScreen.tsx`
- `selectedTrainingId: string` → `selectedTrainingIds: Set<string>` (useState, начальный — пустой Set).
- Удалить `ALL_TRAININGS_VALUE`, `RECENT_TRAININGS_LIMIT`, `showRecentGroup`.
- Удалить `<select>` и `handleTrainingChange`.
- Добавить чип-ряд вместо `.filterRow` с `<select>`.
- `displayedEntries`: `filterAllShotsEntries(entries, selectedTrainingIds.size === 0 ? null : selectedTrainingIds)`.
- `displayLabel`: использовать `formatShotLabel(targetEntry, multiTraining)` где `multiTraining = new Set(displayedEntries.map(e => e.trainingId)).size >= 2`.
- `selectedShotId` сбрасывать только если текущий selectedShotId отсутствует в новых `displayedEntries` (не при любом toggle чипа).
- Удалить `trainingsByRecency`, `shotCountByTrainingId`, `needsTimeInLabel`.
- Оставить `trainingsChronological` (нужен для чипов, порядок реверсируется для отображения).

### 6. `src/screens/AllShotsScreen.module.css`
- `.filterRow` → горизонтальный скролл-контейнер:
  `overflow-x: auto; display: flex; gap: 6px; flex-wrap: nowrap; padding: 0 16px 8px; flex-shrink: 0`
  (padding на внутренний контейнер чтобы не обрезало правый чип).
- `.chip` — базовый стиль: `border: 1px solid var(--color-border); border-radius: 20px; padding: 6px 12px; font-size: 13px; white-space: nowrap; background: none; color: var(--color-text-main); min-height: var(--touch-target-min); cursor: pointer`.
- `.chipActive` — outlined: `border-color: var(--color-border-focus); font-weight: 600; color: var(--color-primary)` (без сплошной заливки → работает в обеих темах без WCAG-проблем).
- Убрать `.trainingSelect`.

### 7. `src/screens/allShotsScreen.render.test.tsx` (новый файл)
- `renderToStaticMarkup` (как в других `*.render.test.tsx`).
- Проверить: при 2 тренировках рендерится ровно 3 чипа (Все + 2).
- Проверить: чип `[Все]` имеет `aria-pressed="true"` при пустом selectedTrainingIds.

## Не трогаем
- `TargetCanvas`, `allShotsRepo`, `db`, `scoring`, `transform`
- `allShotsCaption.formatCommentLine`
- Цвета маркеров на мишени

## Проверка
```bash
npx vitest run
npm run build
```

## Риски / edge cases
- `selectedShotId` при toggle: проверять наличие в `displayedEntries`, не сбрасывать слепо.
- Горизонтальный padding: навесить на внутренний flex-контейнер, не на `overflow: auto` обёртку.
- `.filterRow` должен иметь `flex-shrink: 0` чтобы не сжиматься в `height: 100dvh` родителе.
- a11y: `role="group"` + `aria-label="Тренировки"` на контейнере; каждый чип `<button aria-pressed={...}>`.
- >99 выстрелов в выборке: `shotLabels` не нумерует с сотого (унаследовано, не регрессия).
