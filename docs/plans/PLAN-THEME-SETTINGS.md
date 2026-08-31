# План: Светлая/тёмная тема в настройках

**Дата:** 2025
**Статус:** В работе

## 1. Описание

Добавить в `SettingsScreen` переключатель темы: **Светлая** / **Тёмная**. Выбор
сохраняется в IndexedDB (`settings`) и применяется глобально сразу и при
следующих запусках.

## 2. Хранение

`src/db/schema.ts`: добавить `'themeMode'` в `SettingsKey`.
`src/db/settings.ts`: `initSettings` — если `themeMode === null`, установить
`'light'` (сохраняет текущий внешний вид по умолчанию).

## 3. Применение темы

Новый модуль `src/utils/theme.ts` (без React, чистые функции + один helper
для DOM): `applyTheme(mode: ThemeMode)` — ставит
`document.documentElement.dataset.theme = mode`. `ThemeMode = 'light' | 'dark'`.

`App.tsx`: при старте после `initSettings` читает `themeMode` и вызывает
`applyTheme`.

`SettingsScreen.tsx`: новая секция «Тема» с двумя кнопками (светлая/тёмная).
При выборе — `setSetting(db, 'themeMode', mode)` + `applyTheme(mode)` сразу
(без reload).

## 4. Палитра

`src/styles/tokens.css`: токены остаются дефолтными (светлая тема, без
изменений). Добавляется блок `[data-theme='dark'] { ... }`, переопределяющий
палитру для тёмной темы — графит + зелёный акцент в духе индикаторов
электронных мишеней SIUS, с сохранением контраста (текст на фоне ≥4.5:1):

- `--color-bg-app: #10140f` (тёмно-графитовый с зелёным подтоном)
- `--color-bg-card: #1a2018`
- `--color-bg-toolbar: #0d1a10`
- `--color-text-main: #eaf5ea`
- `--color-text-muted: #a9c2a9`
- `--color-text-subtle: #7f9c80`
- `--color-border: #2c3a2c`
- `--color-border-focus: #4ade80`
- `--color-primary: #22c55e`
- `--color-primary-active: #16a34a`
- `--color-success: #4ade80`
- `--color-selected: #22c55e`
- `--color-danger` / `--color-danger-active` остаются близкими к исходным
  (тёплый контраст на графите), проверить читаемость.

Никаких новых зависимостей, только CSS custom properties.

## 5. Тесты

- `src/db/settings.test.ts` (если есть) — либо новый `theme.test.ts` для
  `applyTheme`.
- Обновить/добавить рендер-тест `SettingsScreen` на наличие переключателя темы.

## 6. Не в объёме

Без опции "системная" тема (не запрошено), без анимаций перехода темы.

## 7. Тёмная тема мишени и цветов выстрелов (доп. этап, одобрено пользователем)

Геометрия мишени (`RING_D`, радиусы, ISSF-разметка) и логика подсчёта очков
(`scoring.ts`, `transform.ts`) не меняются — только цвета отрисовки в
`TargetCanvas.tsx` / `TargetLoupe.module.css`, вынесенные в CSS custom
properties (`src/styles/tokens.css`), переопределяемые в блоке
`[data-theme='dark']`:

- `--target-paper` — фон мишени (было `white`), в тёмной теме тёмный
  графитово-зелёный (`#16211a`) вместо ослепляющего белого.
- `--target-black-zone` — центральная чёрная зона (было `black`), в тёмной
  теме почти чёрный с едва заметным зелёным подтоном (`#050706`).
- `--target-outer-ring-stroke` / `--target-inner-ring-stroke` /
  `--target-center-dot` / `--target-label-outer` / `--target-label-inner` —
  линии колец и подписи; в тёмной теме — фосфорно-зелёные тона в духе
  индикаторов SIUS (`#3f5c46` / `#7fdb9a` / `#cfe9d4`), сохраняющие читаемость
  на новом тёмном фоне.
- `--target-shot-regular-fill` / `--target-shot-emphasis-fill` /
  `--target-shot-selected-fill` / `--target-shot-stroke` / `--target-shot-text`
  — цвета маркеров выстрелов (обычный/последний-или-тянущийся/выбранный,
  обводка, текст номера). Обычный выстрел в тёмной теме — приглушённый тёмно-
  зелёный (`#1f6b3d`), чтобы отличаться и от чёрной зоны, и от фона мишени;
  акцентные цвета последнего (`#22c55e`) и выбранного (`#3b82f6`) выстрела не
  меняются между темами — они уже достаточно контрастны на тёмном фоне.
- `--target-loupe-bg` — фон лупы, привязан к `--target-paper`, чтобы не
  создавать белую вспышку поверх тёмного интерфейса.

Перекрестие (`#e11d48`) и цвет курка остаются одинаковыми в обеих темах —
это диагностический элемент, а не часть постоянной палитры мишени.

Тесты (`targetCanvas.render.test.tsx`, `targetCanvasReadOnly.test.tsx`)
обновлены: сравнение цвета маркера идёт по строке `var(--target-*)`, которую
рисует компонент, вместо литералов `black`/`#3B82F6`/`#22C55E` — реальное
разрешение цвета остаётся на стороне браузера через `[data-theme]`.
