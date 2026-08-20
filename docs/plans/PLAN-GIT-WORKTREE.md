# PLAN-GIT-WORKTREE — перевод репозитория на bare + worktrees

Статус: **черновик, ждёт одобрения**. Реализация — отдельными задачами через `worker`.

## 1. Цель

Дать возможность вести несколько фич параллельно в изолированных рабочих копиях
(`git worktree`), при этом:

- код и планы (`docs/plans/`) версионируются по веткам, как сейчас;
- всё, что относится к работе pi.dev и к деплою, **общее** для всех worktree и не дублируется.

## 2. Целевая раскладка

```
/Users/vital/Downloads/home/mushketon-coach/     # контейнер, путь не меняется
├── .bare/            # bare git dir (сюда переезжает текущий .git)
├── .git              # файл-указатель: "gitdir: ./.bare"
├── shared/           # общее для всех worktree, вне git
│   ├── .pi/          # settings.json, skills, npm, review
│   ├── .claude/
│   ├── .agents/
│   ├── .wrangler/    # локальный стейт wrangler
│   ├── .env          # деплой-креды (если появятся)
│   └── node_modules/
├── main/             # worktree ветки main
└── wt-<feature>/     # worktree фичи, создаётся по требованию
```

Внутри каждого worktree — симлинки на `../shared/*`:
`.pi`, `.claude`, `.agents`, `.wrangler`, `.env`, `node_modules`.

Обоснование симлинков: `.pi/settings.json` (модели субагентов) и стейт wrangler не должны
расходиться между ветками; `node_modules` общий ради скорости и места.

## 3. Что остаётся в git

`docs/plans/`, `src/`, `public/`, конфиги (`vite.config.ts`, `vitest.config.ts`, `tsconfig*.json`,
`wrangler.toml`, `package.json`, `package-lock.json`), корневые `*.md`.
`wrangler.toml` трекается и уже одинаков во всех worktree — симлинк не нужен.

## 4. Риски и как их снимаем

| Риск | Решение |
| --- | --- |
| Потеря незакоммиченных изменений при переносе | Шаг 0: `git status` должен быть чистым; полный tar-бэкап папки перед началом |
| Общий `node_modules` ломается, если в ветке другой `package-lock.json` | Правило: при изменении зависимостей в ветке — снять симлинк и сделать локальный `npm install`. Проверка: `npx vitest run` в worktree |
| Vite/Vitest резолвят зависимости через симлинк | Проверяется дымовым тестом (`npm run build` + `npx vitest run`) на шаге 5 |
| `.pi/review` пишется двумя агентами одновременно | Правило: один `worker`-писатель на worktree; ревью-артефакты не считаем критичными |
| Внешние ссылки/скрипты на путь `mushketon-coach/src` | После переезда путь становится `mushketon-coach/main/src`; проверить IDE-проект и закладки вручную |

## 5. Шаги реализации

**Шаг 0 — подготовка (обязательно вручную/подтвердить с пользователем)**
1. `git status --short` — пусто, `git log origin/main..HEAD` — пусто (либо запушить).
2. Бэкап: `tar -czf ~/mushketon-coach-backup-$(date +%F).tgz -C ~/Downloads/home mushketon-coach`.
- Verify: архив создан, `git status` чистый.

**Шаг 1 — превратить репозиторий в bare-контейнер**
```bash
cd ~/Downloads/home/mushketon-coach
mkdir -p ../mc-tmp && mv .git ../mc-tmp/.bare
git --git-dir=../mc-tmp/.bare config core.bare true
```
- Verify: `git --git-dir=../mc-tmp/.bare log --oneline -1` показывает `6894799`.

**Шаг 2 — перенести общее в `shared/`**
```bash
mkdir -p ../mc-tmp/shared
mv .pi .claude .agents .wrangler node_modules ../mc-tmp/shared/ 2>/dev/null
```
Остальное содержимое старой папки (рабочая копия) удаляется — оно восстановится из git.
Незатрекованные и нужные файлы (`context.md`, `dist/`, `skills-lock.json`) — либо в `shared/`,
либо выбрасываются (генерируемые).
- Verify: `ls ../mc-tmp/shared` содержит 5 записей.

**Шаг 3 — собрать целевую структуру**
```bash
rm -rf ~/Downloads/home/mushketon-coach
mv ../mc-tmp ~/Downloads/home/mushketon-coach
cd ~/Downloads/home/mushketon-coach
echo "gitdir: ./.bare" > .git
git worktree add main main
```
- Verify: `git worktree list` показывает `main`; `ls main/src` не пустой.

**Шаг 4 — скрипт линковки общего**
Создать `shared/link-shared.sh`:
```bash
#!/usr/bin/env bash
# использование: shared/link-shared.sh <путь-к-worktree>
set -euo pipefail
wt="$(cd "$1" && pwd)"; root="$(cd "$(dirname "$0")/.." && pwd)"
for name in .pi .claude .agents .wrangler .env node_modules; do
  [ -e "$root/shared/$name" ] || continue
  ln -sfn "$root/shared/$name" "$wt/$name"
done
```
Применить к `main/`.
- Verify: `readlink main/.pi` → `../shared/.pi`; `cat main/.pi/settings.json` читается.

**Шаг 5 — дымовая проверка**
```bash
cd main && npx vitest run && npm run build
```
- Acceptance: 285 тестов зелёные, `main/dist/` собрался.

**Шаг 6 — обновить `.gitignore`**
Добавить `shared/` не нужно (она вне worktree), но правило `.*/` уже покрывает симлинки-дотфайлы.
Проверить, что `git status` в `main/` чистый (симлинк `node_modules` игнорируется).
- Verify: `cd main && git status --short` пусто.

**Шаг 7 — обновить `AGENTS.md`** (в ветке main, см. §7 ниже).
- Verify: `npx vitest run` (без изменений кода) + ревью.

## 6. Как создаётся новый worktree (после внедрения)

```bash
cd ~/Downloads/home/mushketon-coach
git worktree add wt-<feature> -b <feature>
shared/link-shared.sh wt-<feature>
cd wt-<feature> && npx vitest run
```
Удаление: `git worktree remove wt-<feature>` (симлинки уходят вместе с папкой).

## 7. Изменения в AGENTS.md

- В §2 «Commands» добавить, что команды выполняются **внутри worktree** (`main/` или `wt-*/`),
  а не в корне контейнера.
- В §3 «Where things are» добавить блок раскладки контейнера и пометку, что пути
  `src/…`, `docs/plans/…` относятся к текущему worktree.
- Новый подраздел «Worktrees» с командами создания/удаления и правилами:
  - `docs/plans/` и код версионируются по веткам;
  - `.pi`, `.claude`, `.agents`, `.wrangler`, `.env`, `node_modules` — симлинки на `shared/`,
    их нельзя коммитить и нельзя править «под ветку»;
  - при изменении зависимостей в ветке — локальный `node_modules` вместо симлинка;
  - один `worker`-писатель на worktree; параллельные задачи → разные worktree.
- В §7 «Delegating» уточнить: изоляция параллельных `worker` достигается разными worktree,
  правило «один writer на рабочую директорию» сохраняется.

## 8. Критерии приёмки

1. `git worktree list` показывает как минимум `main`.
2. В `main/`: `npx vitest run` → 285 passed, `npm run build` → успешно.
3. `main/.pi/settings.json` и `shared/.pi/settings.json` — один и тот же файл.
4. Второй worktree (`wt-smoke`) создаётся по инструкции §6, тесты в нём зелёные, затем удаляется.
5. `git status` в `main/` чистый (кроме осознанных правок AGENTS.md/плана).
6. `AGENTS.md` обновлён по §7.

## 9. Откат

`rm -rf ~/Downloads/home/mushketon-coach && tar -xzf ~/mushketon-coach-backup-<date>.tgz -C ~/Downloads/home`
Возврат к обычному клону возможен всегда: `git clone` из `.bare` в новую папку.
