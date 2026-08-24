# План: Поддержка деплоя на GitHub Pages (Project Pages)

**Дата:** 2025-05-18 (обновлено после реализации)  
**Статус:** ✅ Реализовано и задеплоено  
**URL GitHub Pages:** `https://sst1xx.github.io/mushketon-coach/`  
**Целевой подпуть (subpath):** `/mushketon-coach/`  
**Источник Pages в настройках репозитория (Settings → Pages → Build and deployment):** `GitHub Actions` (не `Deploy from a branch`) — при `Deploy from a branch` GitHub дополнительно запускает встроенный legacy-пайплайн `pages build and deployment` (`actions/jekyll-build-pages@v1`), который падает на симлинке `node_modules` в корне репозитория; при `Source: GitHub Actions` этот legacy-пайплайн не запускается.

---

## 1. Цели и ограничения

### 1.1 Цели
- Обеспечить полностью автономный и безопасный билд/деплой на GitHub Pages по адресу `https://sst1xx.github.io/mushketon-coach/`.
- Сохранить 100% работоспособность и независимость существующего продакшн-пайплайна Cloudflare Pages (`wrangler.toml`, деплой в root `/`).
- Гарантировать корректную работу SPA, Service Worker (`workbox`), PWA Manifest, иконок и ассетов внутри подпути `/mushketon-coach/`.

### 1.2 Ограничения и жесткие правила (Hard Rules)
- **Zero Impact on Cloudflare:** Дефолтный билд (`npm run build` локально и в Wrangler) должен по-прежнему генерировать сайт с `base: '/'`.
- **Никаких runtime-зависимостей или backend-серверов:** PWA остается строго оффлайн-клиентским (`IndexedDB`, `ServiceWorker`).
- **CSP & Security:** Политики безопасности CSP (`public/_headers` и `index.html`) не ослабляются (`unsafe-inline`/`unsafe-eval` запрещены).
- **Минимальность изменений:** Не трогать геометрию, scoring, бизнес-логику и существующие скрипты.

---

## 2. Архитектурное решение (Conditional Base & Subpath Awareness)

### 2.1 Динамический `base` в Vite
В Vite конфигурации `vite.config.ts` базовый URL задается через переменную окружения `GITHUB_PAGES` (или стандартную `GITHUB_ACTIONS`):
```typescript
const isGitHubPages = process.env.GITHUB_PAGES === 'true';
const basePath = isGitHubPages ? '/mushketon-coach/' : '/';
```
- При локальной разработке (`npm run dev`) и продакшн-билде Cloudflare Pages: `base: '/'`.
- При сборке в GitHub Actions (где передается `GITHUB_PAGES=true` или проверяется имя репозитория): `base: '/mushketon-coach/'`.

### 2.2 Корректность PWA Manifest и Service Worker
1. **PWA Manifest (`vite.config.ts`):**
   - `start_url`: вычисляется динамически относительно `basePath` (для GH Pages — `/mushketon-coach/` или `.` / `./`, для CF — `/`).
   - `scope`: `/mushketon-coach/` при GH Pages билде (или автоматически через `vite-plugin-pwa` относительно `base`).
   - `icons`: пути `icon-192.png`, `icon-512.png` должны резолвиться корректно внутри subpath.
2. **Регистрация Service Worker (`src/main.tsx`):**
   - Текущий хардкод `new Workbox('/sw.js')` не работает в subpath `/mushketon-coach/` (он пытается загрузить `https://sst1xx.github.io/sw.js` вместо `https://sst1xx.github.io/mushketon-coach/sw.js`).
   - Решение: использование `import.meta.env.BASE_URL`:
     ```typescript
     const swUrl = `${import.meta.env.BASE_URL}sw.js`;
     const workbox = new Workbox(swUrl);
     ```
   - Это гарантирует, что на Cloudflare загрузится `/sw.js`, а на GitHub Pages — `/mushketon-coach/sw.js`.
3. **HTML Favicon (`index.html`):**
   - Ссылка на иконку в `<head>`: `<link rel="icon" type="image/png" href="/icon-192.png" />` заменяется на относительный путь или обрабатывается Vite при сборке (Vite автоматически трансформирует ссылки с учетом `base`, если они указаны правильно, либо `<link rel="icon" type="image/png" href="./icon-192.png" />`).

### 2.3 CSP и Заголовки
1. **GitHub Pages не поддерживает `_headers`:**
   - Файл `public/_headers` используется исключительно Cloudflare Pages и игнорируется GitHub Pages.
   - В `index.html` уже присутствует тег `<meta http-equiv="Content-Security-Policy" ... />`.
   - Директивы CSP (`default-src 'self'; script-src 'self'; style-src 'self'; worker-src 'self'; ...`) валидны для `https://sst1xx.github.io/mushketon-coach/`, так как `'self'` включает подпути источника `https://sst1xx.github.io`.
   - `base-uri 'none'` в CSP: при необходимости убедиться, что тег `<base>` не инжектится (Vite не добавляет `<base>` по умолчанию, а префиксирует URL ассетов).

---

## 3. GitHub Actions Workflow

Фактически используемый файл: `.github/workflows/deploy-github-pages.yml` (имя `deploy-pages.yml`, упомянутое ниже по первоначальному плану, в реализации не использовано). Характеристики совпадают с планом ниже:

### 3.1 Permissions & Environment
```yaml
permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false
```
- Не требуются сторонние токены или секреты (используется встроенный OIDC токен GitHub Pages `id-token: write`).

### 3.2 Этапы пайплайна (Job Steps)
1. **Checkout:** `actions/checkout@v4`
2. **Setup Node:** `actions/setup-node@v4` с версией Node.js 20 и кэшированием `npm`.
3. **Install:** `npm ci`
4. **Test & Verify:** `npx vitest run` (гарантия, что сборка не упадет на сломанных тестах).
5. **Build:** Сборка с флагом `GITHUB_PAGES=true`:
   ```yaml
   - name: Build with Vite
     run: npm run build
     env:
       GITHUB_PAGES: 'true'
   ```
6. **Upload artifact:** `actions/upload-pages-artifact@v3` (папка `dist/`).
7. **Deploy to GitHub Pages:** `actions/deploy-pages@v4`.

---

## 4. Затрагиваемые файлы

| Файл | Тип изменений | Описание |
|---|---|---|
| `vite.config.ts` | Изменение | Чтение `process.env.GITHUB_PAGES`, установка `base: isGitHubPages ? '/mushketon-coach/' : '/'`, настройка `start_url` в manifest |
| `src/main.tsx` | Изменение | Замена хардкода `/sw.js` на `${import.meta.env.BASE_URL}sw.js` при создании `Workbox` |
| `index.html` | Проверка/изменение | Проверка резолва favicon `<link rel="icon" ...>` с учетом Vite `base` |
| `.github/workflows/deploy-github-pages.yml` | Новый файл | Workflow сборки и публикации на GitHub Pages (фактическое имя файла; см. §3) |
| `docs/plans/PLAN-GITHUB-PAGES.md` | Новый файл | Настоящий документ плана |

*Примечание: `wrangler.toml`, `public/_headers`, база данных (`src/db/*`), доменная модель (`src/domain/*`), компоненты и тесты не модифицируются.*

---

## 5. Этапы реализации

### Этап 1: Подготовка конфигурации сборки
1. Скорректировать `vite.config.ts` для поддержки `process.env.GITHUB_PAGES`.
2. Обновить вызов `new Workbox()` в `src/main.tsx` с использованием `import.meta.env.BASE_URL`.
3. Проверить локальную сборку по умолчанию: `npm run build` → убедиться, что в `dist/index.html` пути начинаются с `/assets/...` (для Cloudflare).
4. Проверить локальную сборку для GH Pages: `GITHUB_PAGES=true npm run build` → убедиться, что пути начинаются с `/mushketon-coach/assets/...`, manifest содержит `start_url: "/mushketon-coach/"`, Service Worker регистрирует правильный scope.

### Этап 2: Создание GitHub Actions Workflow — выполнено
1. Создан `.github/workflows/deploy-github-pages.yml`.
2. Настроен триггер `on: push: branches: [main]` и `workflow_dispatch` (ручной запуск).
3. Добавлен обязательный шаг тестирования перед билдом.
4. В настройках репозитория (Settings → Pages) источник установлен на `GitHub Actions`, чтобы legacy Jekyll-пайплайн не запускался параллельно.

### Этап 3: Тестирование и валидация (Smoke Check) — выполнено
1. Прогнан весь набор vitest (`npx vitest run`) в workflow перед сборкой.
2. Service Worker и оффлайн-кэш работают в subpath `/mushketon-coach/` на продакшен-адресе https://sst1xx.github.io/mushketon-coach/.
3. Публикация подтверждена: workflow `Deploy to GitHub Pages` завершается успешно после каждого push в `main`, без параллельного запуска legacy Jekyll pipeline.

---

## 6. Acceptance Criteria (Критерии приемки) — выполнены

1. **Изоляция Cloudflare:**
   - Выполнение `npm run build` без переменных окружения формирует `dist/` с `base: '/'`.
   - Конфигурация `wrangler.toml` остается без изменений.
2. **GitHub Pages Subpath Build:**
   - Выполнение `GITHUB_PAGES=true npm run build` формирует ассеты и manifest со ссылками на `/mushketon-coach/...`.
   - В `dist/sw.js` прекэш содержит корректные URL с префиксом подпути.
3. **PWA & Offline в subpath:**
   - Приложение открывается по адресу `https://sst1xx.github.io/mushketon-coach/`.
   - Service Worker успешно регистрируется в скоупе `/mushketon-coach/` без 404 ошибок на `sw.js`.
   - PWA устанавливается как standalone-приложение на мобильных устройствах.
   - Оффлайн-режим (IndexedDB + precache) работает идентично корневому деплою.
4. **Безопасность (Security):**
   - CSP не разрешает `'unsafe-inline'` или `'unsafe-eval'`.
   - Workflow не требует внешних секретов или повышенных прав (только `pages: write`, `id-token: write`).
5. **Тесты:**
   - Полный набор Vitest проходит без ошибок в workflow перед каждым деплоем (точное число тестов растёт с каждым PR и не фиксируется здесь).

---

## 7. Риски и стратегии отката (Rollback)

### 7.1 Риски и пути минимизации
- **Риск:** Рассинхронизация скоупа Service Worker между Cloudflare (`/`) и GitHub Pages (`/mushketon-coach/`).
  - *Минимизация:* Использование строго `import.meta.env.BASE_URL` при инициализации Workbox.
- **Риск:** Ошибки 404 при прямой навигации/обновлении страницы (SPA routing fallback).
  - *Минимизация:* В приложении `mushketon-coach` используется стейт-роутинг внутри `App.tsx` (без HTML5 History API pushState/sub-routes), поэтому корневой `/mushketon-coach/index.html` обрабатывает все переходы без дополнительных redirect-хаков (таких как `404.html` SPA redirect).
- **Риск:** Кэширование устаревшего Service Worker в браузере при открытии GH Pages версии.
  - *Минимизация:* Существующий механизм `UpdateBanner` и `cleanupOutdatedCaches()` в `src/sw.ts` обеспечивают безопасную очистку кэша.

### 7.2 Стратегия отката (Rollback)
- **Откат в GitHub:** В настройках репозитория GitHub (*Settings -> Pages*) деактивировать GitHub Pages или переключить источник сборки на *Disabled*.
- **Откат кода:** Удаление `.github/workflows/deploy-github-pages.yml` и сброс изменений в `vite.config.ts` / `src/main.tsx` мгновенно возвращает репозиторий в исходное состояние.
- На Cloudflare Pages откат не требуется, так как продакшн-конфигурация Cloudflare не модифицируется.

---

## 8. Фактический исход реализации

- Workflow `.github/workflows/deploy-github-pages.yml` собирает проект через Vite (`npm run build` с `GITHUB_PAGES=true`) и публикует `dist/` через `actions/upload-pages-artifact@v3` + `actions/deploy-pages@v4`.
- В настройках репозитория (Settings → Pages → Build and deployment → Source) установлено значение `GitHub Actions`.
- Сайт доступен по адресу https://sst1xx.github.io/mushketon-coach/.
- Legacy встроенный пайплайн GitHub Pages `pages build and deployment` (Jekyll, `actions/jekyll-build-pages@v1`), который запускался при источнике `Deploy from a branch` и падал из-за симлинка `node_modules`, больше не запускается после переключения источника на `GitHub Actions`.
