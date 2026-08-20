# Краткая спецификация изменений для worker

**Задача:** Исправить баг визуального zoom + изменить UI кнопки

---

## 1. Визуальный zoom (основная проблема)

**Сейчас:** Zoom7 просто рисует маленький белый круг (r=29.75mm) в большом viewBox  
**Нужно:** Увеличить центральную зону так, чтобы она занимала весь viewBox (эффект приближения камеры)

**Решение через ZOOM_SCALE коэффициент:**

```typescript
// TargetCanvas.tsx
const ZOOM_SCALE = zoomMode === 'zoom7' 
  ? 80 / (RING_D[7] / 2)  // 80 / 29.75 ≈ 2.69
  : 1.0;

// 1. Масштабировать радиусы колец:
<circle r={RING_D[7] / 2 * ZOOM_SCALE} />  // 29.75 * 2.69 = 80
<circle r={RING_D[8] / 2 * ZOOM_SCALE} />  // и т.д.

// 2. Масштабировать координаты выстрелов:
const scaledXh = shot.x * ZOOM_SCALE;
const scaledYh = shot.y * ZOOM_SCALE;
const sp = targetToScreen(scaledXh, scaledYh, SVG_TARGET_RECT);

// 3. Демасштабировать координаты ввода:
const target = screenToTarget(clientX, clientY, rect);
const actualXh = target.xh / ZOOM_SCALE;
const actualYh = target.yh / ZOOM_SCALE;
// onDragStart/Move передают actualXh/actualYh в hundredths of mm

// 4. Масштабировать радиусы лабелей:
const ringLabels = zoomMode === 'zoom7'
  ? RING_LABELS_ZOOM7.map(l => ({ ...l, r: l.r * ZOOM_SCALE }))
  : RING_LABELS_FULL;
```

---

## 2. UI кнопки: циклическое переключение

**Сейчас (TrainingScreen.tsx):**
```tsx
// Две иконки:
{zoomMode === 'full' ? '🎯' : '🔍'}
```

**Нужно:**
```tsx
// Одна кнопка показывает текущий режим:
{zoomMode === 'full' ? '1-10' : '7-10'}

// Клик переключает циклически:
const toggleZoom = async () => {
  const modes: ('full' | 'zoom7')[] = ['full', 'zoom7'];
  const current = modes.indexOf(zoomMode);
  const next = modes[(current + 1) % modes.length];
  setZoomMode(next);
  const db = await openDB();
  await setSetting(db, 'targetZoomMode', next);
};
```

**Зачем:** Готовимся к добавлению промежуточных режимов (например `'zoom8'` для "8-10").

**Будущее расширение:**
```typescript
// Когда добавим промежуточный zoom:
const modes: ZoomMode[] = ['full', 'zoom7', 'zoom8'];
// Автоматически станет: 1-10 → 7-10 → 8-10 → 1-10
```

---

## 3. Изменяемые файлы

### src/components/TargetCanvas.tsx
- Добавить вычисление `ZOOM_SCALE`
- Масштабировать радиусы колец × ZOOM_SCALE
- Масштабировать координаты выстрелов × ZOOM_SCALE перед targetToScreen
- Демасштабировать координаты ввода ÷ ZOOM_SCALE после screenToTarget
- Масштабировать радиусы лабелей

### src/screens/TrainingScreen.tsx
- Изменить текст кнопки: `'🎯'/'🔍'` → `'1-10'/'7-10'`
- Изменить toggleZoom на циклический переключатель (сейчас два режима, легко расширяется)

### НЕ меняются:
- `src/transform.ts` — оставить как есть
- `src/scoring.ts` — не затронут
- `src/db/*` — схема не меняется
- Тесты: должны пройти без изменений

---

## 4. Критерии приёмки

**Визуальный zoom:**
- ✅ В режиме 7-10: центральная зона увеличена, занимает весь viewBox
- ✅ Кольца 7-10 крупные
- ✅ Выстрелы увеличены пропорционально
- ✅ Tap в центр даёт 10.9 (scoring работает корректно)
- ✅ Переключение 1-10 ↔ 7-10 корректно масштабирует выстрелы

**UI кнопка:**
- ✅ Одна кнопка показывает "1-10" или "7-10"
- ✅ Клик → циклическое переключение
- ✅ Код готов к добавлению промежуточных режимов

**Тесты:**
- ✅ Все 254 теста проходят

---

## 5. Технические детали

**Почему ZOOM_SCALE = 80 / (RING_D[7] / 2)?**
- Полная мишень: радиус 80mm занимает весь viewBox 160×160
- Zoom7: хотим чтобы радиус кольца-7 (29.75mm) занимал те же 80 единиц viewBox
- Коэффициент: 80 / 29.75 ≈ 2.69
- Все координаты × 2.69 → центр увеличивается визуально

**Почему не менять transform.ts?**
- `screenToTarget()` и `targetToScreen()` работают с viewBox координатами
- Масштабирование делаем **до** вызова targetToScreen и **после** screenToTarget
- Функции остаются pure, не зависят от zoom режима
- Меньше риска сломать существующую логику

**Почему циклическая кнопка?**
- Одна кнопка экономит место в header (важно на телефоне)
- Явно показывает текущий режим ("7-10" понятнее чем "🔍")
- Легко расширяется: добавляем `'zoom8': '8-10'` в массив — всё работает
- UX стандартный: клик → следующий режим по кругу

---

**Читай docs/bugs/BUG-TARGET-ZOOM-VISUAL.md для полного контекста и визуальных примеров.**
