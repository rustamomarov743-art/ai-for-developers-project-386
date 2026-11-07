# Календарь звонков

## Структура

- `backend/` — Spring Boot и Maven.
- `frontend/` — React, TypeScript и Vite.

## Команды

- `mise run backend` — запуск backend.
- `mise run frontend` — запуск frontend.
- `mise run check` — все проверки; должна проходить перед завершением изменения.
- `mise run backend-format` — форматирование Java через Spotless.

CI запускает `mise run check`.

## Правила

- Коммиты следуют Conventional Commits: `feat:`, `fix:`, `chore:` и другие стандартные типы.
- Не отключать правила проверок ради зелёного прогона. Исключение должно быть узким, обоснованным и согласованным с человеком.
- Не редактировать вручную файлы в `frontend/src/api/generated/`; изменения вносятся через контракт и повторную генерацию.
