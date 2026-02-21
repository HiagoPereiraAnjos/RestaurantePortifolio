# Preparação para Backend (Postgres)

Este projeto já contém estrutura de backend (Express + Drizzle + Postgres) e o frontend continua **offline/localStorage por padrão**.

## Como ativar o modo backend (sem quebrar o modo offline)

1) Crie um arquivo `.env` (baseado em `.env.example`) e configure:

- `DATABASE_URL` (obrigatório para o backend)
- `VITE_BACKEND_MODE=api` (opcional)
- `VITE_API_BASE_URL` (opcional – se vazio, usa mesma origem)

2) Rodar backend + frontend (mesma porta 5000):

```bash
npm run dev:fullstack
```

> Se quiser continuar apenas com o frontend (offline):

```bash
npm run dev
```

## Contrato de API

O contrato está em `shared/routes.ts`.

### Endpoint recomendado para sincronização inicial

- `GET /api/state` – retorna um snapshot completo (menu, categorias, comandas, pedidos e itens).

O frontend possui um bootstrap **não-invasivo** em `client/src/components/backend/BackendBootstrap.tsx`:

- Só roda quando `VITE_BACKEND_MODE=api`
- Se o backend estiver indisponível, ele falha silenciosamente e o sistema segue funcionando offline.

## Esquema do banco

O esquema está em `shared/schema.ts` e já inclui:

- `categories` com `sendToKitchen`
- `menu_items` com `image` (URL ou data URL)
- `orders` com `receiptId` e `closedAt`
- `order_items` com status incluindo `canceled` e `delivered`

Quando você começar a implementar as regras do backend, o ideal é:

1) Persistir tudo no Postgres
2) Emitir atualizações em tempo real (WebSocket) ou polling
3) No frontend, trocar gradualmente as ações do Zustand para chamarem a API (mantendo fallback offline enquanto necessário)
