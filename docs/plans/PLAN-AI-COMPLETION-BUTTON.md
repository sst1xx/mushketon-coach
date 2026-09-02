# PLAN-AI-COMPLETION-BUTTON.md — Кнопка «Анализ с AI» при завершении серии/упражнения

> Ревизия 1 после oracle-ревью: исправлены §4 (Variant B), §5 (scalar prop), §6 (useState-индексы),
> §7 (вертикальный стек), §8 (текст not-logged-in), §9 (убраны App.tsx-изменения), §11 (360px).
>
> Ревизия 2 после council-mode (oracle × reviewer, 2 passes): исправлены §5 (preselect-логика,
> тип Record, union-семантика), §7 (порядок кнопок), §9 (пояснение initialTrainingId).

## 1. Цель

Когда серия (10 выстрелов) или упражнение ПП-3 (60 выстрелов) завершается, в модальном окне
«серия завершена» / «упражнение ПП-3 завершено» появляется кнопка **«Анализ с AI»**.

- Если пользователь **залогинен** в OpenRouter — кнопка открывает `AiAnalysisModal`
  с текущей тренировкой предвыбранной.
- Если **не залогинен** — показывается modal с инструкцией, как войти.

---

## 2. Затрагиваемые файлы

| Файл | Что меняется |
|---|---|
| `src/screens/TrainingScreen.tsx` | читать `openrouterToken` + `aiModel` в mount-эффекте; реструктурировать completion modal (вертикальный стек); добавить inline `AiAnalysisModal` + `NotLoggedInModal` |
| `src/screens/TrainingScreen.module.css` | нет изменений — уже есть `.newChoiceActions` / `.newChoiceBtn` |
| `src/screens/trainingScreenCompletionModal.test.tsx` | обновить существующие тесты (labels изменятся); добавить новые тест-кейсы |
| `src/components/AiAnalysisModal.tsx` | добавить `initialTrainingId?: string` (скаляр) |
| `src/components/AiAnalysisModal.test.tsx` | тест предвыбора через `initialTrainingId` |

**`App.tsx` не меняется** — AiAnalysisModal рендерится внутри TrainingScreen (Variant B).

---

## 3. Поведение кнопки

```
Completion modal показан
    │
    ├─ orToken !== null (залогинен)
    │       └─ клик «Анализ с AI»
    │               → setAiPhase('select')
    │               → setShowCompletedModal(false)
    │               → AiAnalysisModal рендерится inline в TrainingScreen
    │                 с initialTrainingId = currentTraining.id
    │
    └─ orToken === null (не залогинен)
            └─ клик «Анализ с AI»
                    → setAiPhase('needLogin')
                    → setShowCompletedModal(false)
                    → NotLoggedInModal (inline) с инструкцией
                      [Понятно]
```

---

## 4. Архитектурный выбор: Variant B

**AiAnalysisModal рендерится внутри TrainingScreen**, аналогично тому, как это сделано в
`SettingsScreen.tsx:298-305`. Нет изменений в `App.tsx`, нет новых пропсов у `TrainingScreen`.

`TrainingScreen` сам читает `openrouterToken` и `aiModel` в mount-эффекте и управляет фазой.

---

## 5. Изменения в AiAnalysisModal

Добавить **скалярный** проп (не массив — массив создаёт новую ссылку на каждый рендер
и ломает deps у эффекта `[athlete.id]`):

```ts
interface Props {
  athlete: AthleteRecord;
  apiKey: string;
  model: string;
  onClose: () => void;
  initialTrainingId?: string;   // ← новый проп
}
```

В эффекте (deps `[athlete.id]`), после загрузки `withShots`, использовать **union-семантику**
(«топ-3 + гарантированное включение current»), а не замену:

```ts
const preselected: Record<string, boolean> = {};
withShots.slice(0, 3).forEach(({ training }) => { preselected[training.id] = true; });
if (initialTrainingId && withShots.some(e => e.training.id === initialTrainingId)) {
  preselected[initialTrainingId] = true;
}
setSelected(preselected);
```

**Почему не замена:** в обычном сценарии только что завершённая тренировка уже является
`withShots[0]` (сортировка по `startedAt` убыванию) и входит в дефолтный `slice(0, 3)`.
`initialTrainingId` нужен только для edge case переоткрытой старой тренировки — он
гарантирует включение, не заменяет дефолт. Нулевой риск регрессии.

**Тип:** `Record<string, boolean>` — реальный тип состояния (`AiAnalysisModal.tsx:38`).
`new Set(ids)` из прежнего плана несовместим с этим типом и привёл бы к ошибке сборки.

---

## 6. Чтение токена и модели в TrainingScreen

В существующем mount-эффекте (`deps: [training]`), где уже читается `zoomMode`, добавить:

```ts
const rawToken  = await getSetting(db, 'openrouterToken');
const rawModel  = await getSetting(db, 'aiModel');
const token  = typeof rawToken === 'string' && rawToken ? rawToken : null;
const model  = typeof rawModel === 'string' && rawModel ? rawModel : DEFAULT_MODEL;
setAiSettings({ token, model });
```

### Индексы useState (для тестового harness)

Существующие (0-13):

| idx | state |
|---|---|
| 0 | currentTraining |
| 1 | shots |
| 2 | dragging |
| 3 | selectedShotId |
| **4** | **loading** ← форсируется `false` в тестах |
| 5 | zoomMode |
| 6 | busy |
| 7 | commentModal |
| 8 | commentText |
| **9** | **showCompletedModal** ← форсируется `true` в тестах |
| 10 | completedModalDismissed |
| 11 | showNewChoiceModal |
| 12 | selectedSeriesView |
| 13 | toast |

**Новые состояния — добавить в конец:**

| idx | state | тип |
|---|---|---|
| 14 | aiSettings | `{ token: string \| null; model: string }` |
| 15 | aiPhase | `null \| 'select' \| 'needLogin'` |

Добавление в конец гарантирует, что существующий override `{ 4: false, 9: true }` не сломается.

---

## 7. Реструктуризация completion modal

**Проблема:** `Modal.actions` — flex-строка без `flex-wrap`. При 4 кнопках на 360px экране
(iPhone SE, Android mid-range) суммарная min-width ~403px + gaps 24px → 427px > 295px доступных.
Получается горизонтальный скролл без видимого скроллбара.

**Решение:** перенести основные действия в `children` как вертикальный стек (паттерн уже есть
в `showNewChoiceModal` в том же файле — `.newChoiceActions` / `.newChoiceBtn`). В `Modal.actions`
оставить только нейтральное «Просмотр» (dismiss).

```tsx
<Modal
  isOpen={showCompletedModal}
  onClose={handleDismissCompletedModal}
  actions={[
    { label: 'Просмотр', onClick: handleDismissCompletedModal },
  ]}
>
  <p className={s.dialogHeading}>{...}</p>
  <p className={s.dialogInfo}>...</p>
  <div className={s.newChoiceActions}>
    <button className={s.newChoiceBtn} onClick={handleOpenGeneralRemark}>
      Общее замечание
    </button>
    <button className={s.newChoiceBtn} onClick={handleAnalyzeAi}>
      Анализ с AI
    </button>
    <button className={s.newChoiceBtn} onClick={handleStartNew}>
      Начать новую
    </button>
  </div>
</Modal>
```

Порядок: **Общее замечание → Анализ с AI → Начать новую** (наиболее деструктивное — последнее).

Обоснование: «Общее замечание» — локальное, не требует сети, тренер делает его чаще.
«Анализ с AI» — рефлексивное, требует сети и авторизации. «Начать новую» —
наиболее деструктивное действие, идёт последним.

---

## 8. NotLoggedInModal (inline в TrainingScreen)

```tsx
<Modal
  isOpen={aiPhase === 'needLogin'}
  onClose={() => setAiPhase(null)}
  actions={[{ label: 'Понятно', onClick: () => setAiPhase(null) }]}
>
  <p className={s.dialogInfo}>
    Анализ с AI требует входа в OpenRouter.
    Откройте Настройки (со списка спортсменов) → «Анализ с AI» → «Войти через OpenRouter».
  </p>
</Modal>
```

**Не** запускать OAuth inline — `window.location.href = …` перезагружает приложение и
сбрасывает стек навигации, тренер теряет контекст тренировки.

Этот `<Modal>` добавить **последним** в JSX компонента (после comment modal), чтобы не сдвигать
индексы в `findElementsByType(element, Modal)[N]` существующих тестов.

---

## 9. AiAnalysisModal inline в TrainingScreen

```tsx
{aiPhase === 'select' && aiSettings.token && (
  <AiAnalysisModal
    athlete={athlete}
    apiKey={aiSettings.token}
    model={aiSettings.model}
    initialTrainingId={currentTraining.id}
    onClose={() => setAiPhase(null)}
  />
)}
```

`initialTrainingId` передаётся для edge case (переоткрытая старая тренировка, которая
может не войти в топ-3 по `startedAt`). В обычном потоке `AiAnalysisModal` сам
выберет топ-3 включая только что завершённую — они совпадут без дополнительной логики.

Нет конфликта с `SettingsScreen` — `App.tsx` рендерит ровно один экран в ветке `if/else`.

---

## 10. Тесты

### trainingScreenCompletionModal.test.tsx

**Обновить существующий тест** (labels изменятся после реструктуризации):
```ts
// Было:
expect(labels).toEqual(['Просмотр', 'Общее замечание', 'Начать новую']);
// Стало:
expect(labels).toEqual(['Просмотр']);
```
И добавить проверку на кнопки в children (через `renderToStaticMarkup` содержимого).

**Обновить комментарий** к индексам useState в начале файла — добавить строки 14/15.

**Новые тест-кейсы:**

| Тест | Форсированные индексы | Что проверяет |
|---|---|---|
| «Анализ с AI» присутствует в children completion modal (после «Общее замечание») | `{ 4: false, 9: true }` | markup содержит «Анализ с AI», порядок кнопок верен |
| `aiPhase='needLogin'` (idx 15) → NotLoggedInModal виден | `{ 4: false, 15: 'needLogin' }` | последний Modal `isOpen=true` |
| `aiPhase='select'` + token → AiAnalysisModal рендерится | `{ 4: false, 14: {token:'k',model:'m'}, 15: 'select' }` | `AiAnalysisModal` в дереве |

### AiAnalysisModal.test.tsx

| Тест | Что проверяет |
|---|---|
| `initialTrainingId` добавляется к топ-3 (union-семантика) | selected содержит и топ-3, и initialTrainingId |
| `initialTrainingId` уже в топ-3 → дубликата нет | selected не изменился vs дефолт |
| без `initialTrainingId` → дефолтные «последние 3» | поведение не регрессировало |

---

## 11. Acceptance criteria

- [ ] При завершении серии (10 выстрелов) в completion modal есть кнопка «Анализ с AI»
- [ ] При завершении упражнения ПП-3 (60 выстрелов) — то же
- [ ] Залогинен → `AiAnalysisModal` открывается с текущей тренировкой предвыбранной
- [ ] Не залогинен → modal с инструкцией «Откройте Настройки → ...», без крэша
- [ ] На ширине 360px все кнопки видны полностью, без горизонтальной прокрутки
- [ ] `npx vitest run` — все тесты зелёные
- [ ] `npm run build` — без ошибок типов

---

## 12. Порядок реализации

1. `AiAnalysisModal.tsx` — добавить `initialTrainingId?: string` + логику предвыбора
2. `TrainingScreen.tsx`:
   a. Добавить `aiSettings` (idx 14) и `aiPhase` (idx 15) в конец useState-списка
   b. Читать `openrouterToken` + `aiModel` в mount-эффекте
   c. Реструктурировать completion modal (вертикальный стек в children, только «Просмотр» в actions)
   d. Добавить `handleAnalyzeAi`
   e. Добавить `AiAnalysisModal` inline (условный рендер)
   f. Добавить `NotLoggedInModal` последним в JSX
3. Тесты: обновить `trainingScreenCompletionModal.test.tsx`, добавить новые кейсы; расширить `AiAnalysisModal.test.tsx`
4. `npx vitest run` + `npm run build`
5. Симлинк `.wrangler` в `wt-ai-completion-button` если не создан: `ln -s ../.wrangler .wrangler`
6. Cloudflare Pages deploy

---

## 13. Риски

- Реструктуризация completion modal **ломает существующий assertion** `toEqual(['Просмотр','Общее замечание','Начать новую'])` — изменение намеренное, `reviewer` должен подтвердить.
- Index-based fake-hooks harness хрупкий: при любом будущем добавлении `useState` до индекса 14/15 тесты перестанут работать корректно. Рекомендуется отдельным PR перейти на выбор Modal по содержимому, но вне скопа этой задачи.
- 3 кнопки в flex-row в текущем коде уже слегка переполняют 360px — исправляется этим PR через реструктуризацию, но стоит проверить на реальном устройстве через Cloudflare deploy.
