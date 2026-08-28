# Exile Path — Путеводитель

Простой помощник для новичков в Path of Exile: выбор класса и стиля игры,
ближайшие шаги развития, связки камней и маршрут по дереву пассивных умений.

## Локальный запуск

Нужен Node.js 22 или новее.

```bash
npm install
npm run dev
```

Сайт откроется по адресу <http://localhost:3000/>. Выбор пользователя и прогресс
сохраняются в `localStorage`, а справочные данные лежат в `public/data/*.json`.

## Проверки

```bash
npm test
npm run build:pages
```

## Публикация

Workflow `.github/workflows/deploy-pages.yml` автоматически проверяет и
публикует сайт при каждом изменении ветки `main`:

<https://avatvar.github.io/poe-builder/>
