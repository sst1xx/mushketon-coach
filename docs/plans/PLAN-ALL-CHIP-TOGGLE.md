# PLAN-ALL-CHIP-TOGGLE: переключение кнопки «Все» в AllShotsScreen

## Цель

Повторный клик на «Все» снимает выделение → ни одна тренировка не выбрана, выстрелы не показываются.

Это позволяет быстро сбросить все выбранные тренировки и начать выбирать по одной.

## Файлы

| Файл | Изменение |
|---|---|
| `src/screens/allShotsFilter.ts` | Пустой `Set` → возвращать `[]` (не «показать всё»); `null` → показать всё |
| `src/screens/allShotsFilter.test.ts` | Обновить тест «empty set» — ожидать `[]` вместо всех entries |
| `src/screens/AllShotsScreen.tsx` | Тип состояния `Set<string> \| null`; `null` = «Все» активна; `toggleAllChip` переключает `null ↔ new Set()` |

## Логика toggleAllChip

```
null        → клик → new Set()   // «Все» активна, жмём — снимаем всё
new Set()   → клик → null        // ничего не выбрано, жмём «Все» — включаем всё
Set([t1])   → клик «Все» → null  // есть выбор, жмём «Все» — показать всё
```

## Состояния selectedTrainingIds

| Значение | Чип «Все» | Выстрелы |
|---|---|---|
| `null` | активен | все |
| `new Set()` | неактивен | нет (0) |
| `Set([t1, ...])` | неактивен | только выбранные |

## Изменения в коде

### allShotsFilter.ts

- Убрать из условия `|| trainingIds.size === 0` (пустой Set больше не «показать всё»)
- Добавить: `if (trainingIds.size === 0) return [];`
- Обновить JSDoc-комментарий

### allShotsFilter.test.ts

- Тест «returns all entries unchanged when trainingIds is an empty set» → переименовать в «returns empty array when trainingIds is an empty set» и ожидать `[]`

### AllShotsScreen.tsx

- `useState<Set<string>>(new Set())` → `useState<Set<string> | null>(null)`
- Убрать `selectedTrainingIds.size === 0 ? null : selectedTrainingIds` → передавать `selectedTrainingIds` напрямую
- `toggleAllChip`: `setSelectedTrainingIds(null)` если не null, иначе `setSelectedTrainingIds(new Set())`
- Условие активности чипа «Все»: `selectedTrainingIds === null`

## Шаги выполнения

1. `worker` — вносит изменения в worktree `wt-all-chip-toggle`, прогоняет `npx vitest run` + `npm run build`, деплоит в Cloudflare Pages
2. `reviewer` — проверяет изменения на корректность и полноту тестов
