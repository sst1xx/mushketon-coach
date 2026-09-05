# План: Улучшения цветов тем оформления (PLAN-THEME-COLORS.md)

## 1. Цель
Устранить выявленные при аудите проблемы контрастности и консистенции цветов в светлой и тёмной темах приложения:
- гарантировать доступность (WCAG AA >= 4.5:1) для белого текста на бейджах статуса в тёмной теме;
- инкапсулировать оставшиеся хардкод-цвета и устаревшие fallback-значения в CSS-токены.

## 2. Проблемы из аудита

1. **Критическая проблема контрастности (WCAG AA):**
   - В тёмной теме (`tokens.css`, `[data-theme="dark"]`) токен `--color-success` равен `#4ade80` (светло-зеленый).
   - Этот цвет проектировался как цвет текста/иконки на тёмном фоне приложения (`--color-bg-app`), где контраст достаточен.
   - Однако в `TrainingsScreen.module.css` класс `.badge` (бейдж «Завершена») использует `background: var(--color-success)` и белый текст `color: #fff`.
   - Контраст `#fff` на фоне `#4ade80` составляет всего **1.56:1**, что грубо нарушает требования доступности WCAG AA (минимум 4.5:1 для обычного текста).
   - Аналогично тому, как сделано для `--color-danger-solid` (`#dc2626`) и `--color-primary-solid` (`#15803d`), требуется отдельный токен `--color-success-solid` для заливок с белым текстом.

2. **Необязательные улучшения (хардкод цветов и устаревшие fallback'и):**
   - **Crosshair (прицельное перекрестие) при драге / в лупе:**
     - В `src/components/TargetCanvas.tsx` (строки 363–365) и `src/components/TargetLoupe.tsx` (строки 29–31) используется хардкод-цвет `stroke="#e11d48"` (ярко-розово-красный).
     - В светлой теме он виден хорошо, но не параметризован через тему target/tokens (например, `--target-crosshair` или токен палитры) и дублируется в двух местах.
   - **Устаревший fallback в RemarkRow:**
     - В `src/components/RemarkRow.module.css` (строка 104) кнопка удаления использует `color: var(--color-danger, #c0392b)`.
     - Значение `#c0392b` — устаревший цвет из старой палитры Flat UI, тогда как текущий токен `--color-danger` равен `#d90429`. Рекомендуется привести fallback к актуальному `--color-danger` значению или использовать просто `var(--color-danger)`.

---

## 3. Архитектура и предлагаемые изменения

### 3.1. Обязательное исправление: токен `--color-success-solid`
- **Файл `src/styles/tokens.css`:**
  - В `:root` (светлая тема):
    - Добавить `--color-success-solid: var(--color-success);` (или `#15803d`, контраст с белым текстом > 4.5:1).
  - В `[data-theme="dark"]` (тёмная тема):
    - Добавить `--color-success-solid: #15803d;` (или оттенок зелёного с контрастом >= 4.5:1 по отношению к белым буквам `#fff`, например `#15803d` / `#166534`).
    - Оставить `--color-success: #4ade80` для текстовых индикаторов на тёмном фоне (например, в `SettingsScreen.module.css`).
- **Файл `src/screens/TrainingsScreen.module.css`:**
  - В `.badge` заменить:
    ```css
    .badge {
      font-size: 12px;
      background: var(--color-success-solid, var(--color-success));
      color: #fff;
      border-radius: 4px;
      padding: 2px 6px;
    }
    ```

### 3.2. Необязательное улучшение: токен перекрестия TargetCanvas / TargetLoupe
- **Файл `src/styles/tokens.css`:**
  - В `:root`:
    - `--target-crosshair: #e11d48;`
  - В `[data-theme="dark"]`:
    - `--target-crosshair: #f43f5e;` (или `#e11d48`, контрастный на тёмной мишени).
- **Файлы `src/components/TargetCanvas.tsx` и `src/components/TargetLoupe.tsx`:**
  - Использовать `stroke="var(--target-crosshair, #e11d48)"` вместо захардкоженного `#e11d48`.

### 3.3. Необязательное улучшение: fallback в RemarkRow
- **Файл `src/components/RemarkRow.module.css`:**
  - Изменить `color: var(--color-danger, #c0392b);` на `color: var(--color-danger);` (или с актуальным дефолтом `#d90429`).

---

## 4. Критерии приемки (Acceptance Criteria)

1. **Контраст бейджа «Завершена»:**
   - В тёмной теме бейдж статуса тренировки имеет контрастность белого текста к фону не менее 4.5:1 (WCAG AA).
   - В светлой теме отображение бейджа сохраняет контрастность и читаемость.
2. **Токены темы:**
   - Токен `--color-success-solid` определен в `:root` и `[data-theme="dark"]`.
   - Семантическое разделение соблюдено: `--color-success` для текста/иконок на `--color-bg-app`, `--color-success-solid` для заливок с белым текстом.
3. **Crosshair & RemarkRow (при реализации опциональных пунктов):**
   - Перекрестие в `TargetCanvas` и `TargetLoupe` использует CSS-переменную с безопасным fallback.
   - `RemarkRow.module.css` не содержит устаревшего цвета `#c0392b`.
4. **Стабильность:**
   - Существующие тесты проходят без ошибок (`npx vitest run`).
   - Сборка и проверка типов TypeScript проходят успешно (`npm run build`).

---

## 5. Проверки и верификация

1. **Тесты:**
   ```bash
   npx vitest run
   ```
   Все существующие тесты (включая рендер-тесты компонентов) должны оставаться зелеными.

2. **Сборка типов и ассетов:**
   ```bash
   npm run build
   ```
   Проверка TypeScript (`tsc -p tsconfig.app.json`) и сборка Vite без ошибок и предупреждений.

3. **Ручная проверка / проверка контрастности:**
   - Проверка коэффициента контрастности: для `#fff` на фоне `--color-success-solid` (`#15803d` дает 4.54:1).
   - Визуальная проверка в светлой и тёмной теме списка тренировок (`TrainingsScreen`).

---

## 6. Деплой в Cloudflare Pages

По правилам проекта (`AGENTS.md` §1, §2, §7):
- После реализации и успешного прохождения проверок (`npx vitest run` и `npm run build`), `worker` **автоматически** выполняет деплой UI в Cloudflare Pages (`wrangler pages deploy dist --project-name musketoon-coach`) без отдельного запроса подтверждения у пользователя.
- В отчете обязательно приводятся per-deploy hash URL и постоянный alias ветки `https://theme-colors.musketoon-coach.pages.dev`.
