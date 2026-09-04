# PLAN-NEW-FLOW — кнопка «Новое» вместо двух кнопок

## Цель

Заменить две рядом стоящих кнопки «+ Новая серия» / «+ Новое упражнение» одной кнопкой **«+ Новое»**.
При нажатии открывается уже существующая модалка `showNewChoiceModal` с двумя кнопками:
«Серия» и «Упражнение ПП-3».

Изменение применяется в **двух местах**:

1. **TrainingsScreen** — нижняя панель экрана списка тренировок.
2. **TrainingScreen** — модалка «Начать новую», которая открывается после завершения серии/упражнения.

Стили сохраняются полностью: переиспользуются существующие классы CSS без визуального рефакторинга.

---

## ⚠️ Конфликт с PLAN-TRAINING-MODES.md

`docs/plans/PLAN-TRAINING-MODES.md` зафиксировал тексты кнопок как **«+ Новая серия»** и **«+ Новое упражнение»**
(строки «В интерфейсе используются две явные команды…» и «…два вертикальных действия: `+ Новая серия` и `+ Новое упражнение`»).

Настоящий план меняет эти тексты на **«Серия»** и **«Упражнение ПП-3»** в обоих местах.

**Требуется синхронизировать PLAN-TRAINING-MODES.md** — обновить в нём тексты кнопок, чтобы оба документа
отражали одно и то же решение. Это нужно сделать в той же задаче `worker`-а, что и код.

---

## Затрагиваемые файлы

| Файл | Изменение |
|------|-----------|
| `src/screens/TrainingsScreen.tsx` | Две кнопки → одна; добавить state `showNewModal` + модалка выбора |
| `src/screens/TrainingsScreen.module.css` | Добавить `.choiceBtn`, `.newChoiceActions`, `.dialogHeading` (см. §CSS ниже) |
| `src/screens/TrainingScreen.tsx` | Поменять тексты кнопок внутри существующей модалки `showNewChoiceModal` |
| `src/screens/TrainingScreen.module.css` | Не требует изменений |
| `docs/plans/PLAN-TRAINING-MODES.md` | Синхронизировать тексты кнопок |

Тест-файлы (новые или обновляемые):

| Файл | Что проверяется |
|------|-----------------|
| `src/screens/trainingScreenCompletionModal.test.tsx` | Тексты кнопок в модалке выбора: «Серия» / «Упражнение ПП-3» вместо старых |
| `src/screens/TrainingsScreen.test.tsx` (создать) | Одна кнопка «+ Новое»; клик открывает модалку с «Серия» / «Упражнение ПП-3» |

---

## Flow

### 1. TrainingsScreen

**До:**
```
[+ Новая серия]   [+ Новое упражнение]
```
обе кнопки вызывают `handleNew(10)` / `handleNew(60)` напрямую.

**После:**
```
[+ Новое]
```
Одна кнопка. При клике: `setShowNewModal(true)`.

Модалка (новый `<Modal isOpen={showNewModal} …>`):
```
Начать новое
  [Серия]           ← handleNew(10), закрыть модалку
  [Упражнение ПП-3] ← handleNew(60), закрыть модалку
  [Отмена]
```

Детали реализации:
- Добавить `const [showNewModal, setShowNewModal] = useState(false)` рядом с другими state.
- Кнопка использует существующий класс `s.addBtn`.
- Кнопки внутри модалки используют новый класс `s.choiceBtn` в `TrainingsScreen.module.css`.

### 2. TrainingScreen

Существующая модалка `showNewChoiceModal` уже готова и открывается из кнопки «Начать новую»
внутри модалки завершения серии. Менять механику открытия не нужно.

**Меняются только тексты кнопок:**

| До | После |
|----|-------|
| `+ Новая серия` | `Серия` |
| `+ Новое упражнение` | `Упражнение ПП-3` |

Заголовок модалки остаётся: `Начать новую`.

---

## CSS — точный вариант без дублирования

`TrainingScreen.module.css` уже содержит `.newChoiceBtn`, `.newChoiceActions`, `.dialogHeading`
с конкретными значениями (строки 205–299). Импортировать CSS из чужого модуля нельзя (CSS Modules
изолированы по имени файла), поэтому в `TrainingsScreen.module.css` добавляются три новых класса
с **теми же самыми значениями**, что и в `TrainingScreen.module.css`.

Обоснование: это не произвольное дублирование, а точное сохранение текущего визуального стиля.
Обе модалки должны выглядеть идентично. Если в будущем понадобится единый источник, стили можно
вынести в `common.module.css`; сейчас этот рефактор не в области задачи.

Добавить в `TrainingsScreen.module.css`:
```css
.dialogHeading {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 8px;
  color: var(--color-text-main);
}

.newChoiceActions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}

.choiceBtn {
  width: 100%;
  min-height: var(--touch-target-min);
  padding: 10px 16px;
  font-size: 15px;
  border-radius: 6px;
  border: none;
  background: var(--color-primary-solid);
  color: #fff;
  cursor: pointer;
}
.choiceBtn:active {
  background: var(--color-primary-active);
  transform: scale(0.97);
}
```

> Перед добавлением проверить, что `.dialogHeading`, `.newChoiceActions` ещё не присутствуют
> в `TrainingsScreen.module.css`; если есть — использовать существующие, не дублировать.

---

## Подробные изменения кода

### `src/screens/TrainingsScreen.tsx`

```tsx
// Добавить state (рядом с confirmDelete)
const [showNewModal, setShowNewModal] = useState(false);

// Заменить блок .newActions:
<div className={s.newActions}>
  <button className={s.addBtn} onClick={() => setShowNewModal(true)}>+ Новое</button>
</div>

// Добавить модалку (после блока confirmDelete Modal):
<Modal
  isOpen={showNewModal}
  onClose={() => setShowNewModal(false)}
  actions={[{ label: 'Отмена', onClick: () => setShowNewModal(false) }]}
>
  <p className={s.dialogHeading}>Начать новое</p>
  <div className={s.newChoiceActions}>
    <button className={s.choiceBtn} onClick={() => { setShowNewModal(false); handleNew(10); }}>Серия</button>
    <button className={s.choiceBtn} onClick={() => { setShowNewModal(false); handleNew(60); }}>Упражнение ПП-3</button>
  </div>
</Modal>
```

### `src/screens/TrainingScreen.tsx`

Найти модалку `showNewChoiceModal` и заменить тексты кнопок:
```tsx
// До:
<button className={s.newChoiceBtn} onClick={() => handleCreateNewTraining(10)}>+ Новая серия</button>
<button className={s.newChoiceBtn} onClick={() => handleCreateNewTraining(60)}>+ Новое упражнение</button>

// После:
<button className={s.newChoiceBtn} onClick={() => handleCreateNewTraining(10)}>Серия</button>
<button className={s.newChoiceBtn} onClick={() => handleCreateNewTraining(60)}>Упражнение ПП-3</button>
```

---

## Тесты

### `src/screens/trainingScreenCompletionModal.test.tsx` (обновить)

Файл уже существует. Найти тесты модалки выбора (`showNewChoiceModal`) и заменить ожидаемые тексты:
- Убрать ожидание `+ Новая серия` / `+ Новое упражнение`.
- Добавить ожидание `Серия` / `Упражнение ПП-3`.

Паттерн файла — `renderFunctionComponentToElement` + `fakeHooks`:

```ts
// Уже установлен в файле:
import { renderFunctionComponentToElement, findElementsByType } from '../testUtils/fakeHooks';

// useState-индексы в TrainingScreen:
//   4  loading                ← false
//   9  showCompletedModal     ← true для completion modal
// Для модалки showNewChoiceModal нужно определить её useState-индекс
// и добавить/обновить тест аналогично renderTrainingScreen() с нужными stateOverrides.
```

### `src/screens/TrainingsScreen.test.tsx` (создать)

Проверить с тем же паттерном `fakeHooks` / `renderFunctionComponentToElement`:

```ts
import { renderFunctionComponentToElement, findElementsByType } from '../testUtils/fakeHooks';
import { renderToStaticMarkup } from 'react-dom/server';
import TrainingsScreen from './TrainingsScreen';
```

Необходимые state-слоты TrainingsScreen (определить по порядку `useState`-вызовов в файле):
- `trainings` — список тренировок (установить `[]` или массив с тестовой записью).
- `showNewModal` — флаг модалки (установить `true` для теста раскрытой модалки).
- Остальные слоты, влияющие на рендер (например `loading`), установить в нейтральные значения.

Тест-кейсы:
1. Рендер показывает ровно одну кнопку с текстом `+ Новое`, и **не показывает** `+ Новая серия` / `+ Новое упражнение`.
2. При `showNewModal = true` разметка содержит `Серия` и `Упражнение ПП-3`.
3. Клик `Серия` вызывает `handleNew` с `10`.
4. Клик `Упражнение ПП-3` вызывает `handleNew` с `60`.

> **Подход к тестированию (важно):** в проекте не используется `vi.mock`; вместо этого
> применяется паттерн `renderFunctionComponentToElement` + `stateOverridesByIndex` из
> `src/testUtils/fakeHooks.ts`. Fake-сеттер `useState` — это `() => {}` (no-op): он **не**
> вызывает ре-рендер. Поэтому клики нельзя тестировать через изменение состояния внутри одного
> рендера. Вместо этого используется **двухпроходный DOM-assertion**:
>
> 1. Первый рендер — `stateOverridesByIndex` с `showNewModal = false`: проверяем, что кнопка
>    «+ Новое» присутствует, а разметки модалки нет.
> 2. Второй рендер — те же `stateOverridesByIndex`, но `showNewModal = true`: проверяем, что
>    разметка модалки содержит «Серия» и «Упражнение ПП-3».
>
> Тест-кейсы 3 и 4 (параметры `handleNew`) проверяются аналогично: передать нужный
> `useState`-слот через `stateOverridesByIndex`, задать `showNewModal = true` и убедиться,
> что соответствующая кнопка присутствует в DOM (нажатие кнопки тестируется через
> `element.onclick` / `element.dispatchEvent` только если `onClick` доступен в статическом
> HTML — при `renderToStaticMarkup` обработчики событий в DOM не регистрируются, поэтому
> достаточно проверить наличие кнопок с нужными текстами). Прямой `vi.mock` не применять.

---

## Что НЕ меняется

- Вся логика `handleNew` / `handleCreateNewTraining` — без изменений.
- Стили кнопок — переиспользуем существующие значения из `TrainingScreen.module.css`.
- CSS других компонентов.
- Workflow PWA, CSP, service worker, IndexedDB — не затрагиваются.

---

## Команды проверки

```bash
# 1. В worktree
cd wt-new-flow

# 2. Тесты
npx vitest run

# 3. Сборка (проверка типов)
npm run build

# 4. Cloudflare Pages deploy (автоматически после успешных тестов/сборки)
npx wrangler pages deploy dist --project-name musketoon-coach
```

Тесты должны остаться зелёными (587+ passing). Сборка не должна выдавать ошибок TypeScript.

---

## Риски и замечания

- Перед добавлением `.dialogHeading` и `.newChoiceActions` в `TrainingsScreen.module.css` —
  проверить, что они там ещё не присутствуют.
- В `TrainingScreen.tsx` строка 86 содержит устаревший комментарий:
  `// "Начать новую" choice modal: "+ Новая серия" / "+ Новое упражнение"`
  После изменения текстов кнопок обновить его до:
  `// "Начать новую" choice modal: "Серия" / "Упражнение ПП-3"`
  (строку 86 правит `worker` в той же задаче, что и остальные изменения кода).
- Имя класса `.choiceBtn` не должно конфликтовать с существующими именами в файле.
- Кнопка «+ Новое» визуально одна, поэтому контейнер `.newActions` остаётся без изменений.
- Кнопки «Серия» / «Упражнение ПП-3» в TrainingScreen — короткие названия, помещаются в существующий стиль `newChoiceBtn`.
- После реализации PLAN-TRAINING-MODES.md в области кнопок модалки убедиться, что тексты по-прежнему согласованы с настоящим планом.
