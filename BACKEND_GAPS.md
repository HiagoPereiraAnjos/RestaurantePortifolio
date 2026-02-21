# Análise do Backend (o que falta para finalizar)

Este projeto já contém um backend (Express + Drizzle + Postgres) **pronto para evoluir**, mas ainda não cobre todas as regras e fluxos do sistema.
O frontend continua funcionando em **modo offline/localStorage** por padrão (`VITE_BACKEND_MODE=local`), então dá para implementar o backend **em etapas**, sem quebrar o app atual.

## 1) O que já existe

### Infra
- Servidor Express (`server/index.ts`) + Vite middleware em dev.
- Variáveis de ambiente carregadas por `server/loadEnv.ts`.
- Conexão Postgres via Drizzle (`server/db.ts`).

### Seed (primeira execução)
- Cria usuário `admin/admin`.
- Cria categorias base (porções, bebidas, buffet, etc.).
- Cria comandas 1..60.
- Cria alguns itens de menu.

### Rotas já implementadas
- Auth (JWT):
  - `POST /api/auth/login`
  - `POST /api/auth/reauth`
  - `POST /api/auth/change-password` (protegida)

- Snapshot inicial:
  - `GET /api/state` (menu, categorias, comandas, pedidos e itens)

- Parcial de recursos:
  - `GET /api/menu-items` (listar)
  - `GET /api/categories` (listar)
  - `PUT /api/categories/:id` (upsert)
  - `DELETE /api/categories/:id`
  - `GET /api/comandas` (listar)
  - `GET /api/orders` (listar)
  - `POST /api/orders` (cria pedido + itens)
  - `POST /api/orders/:id/finalize` (finaliza pedido)
  - `PUT /api/order-items/:id` (atualiza status/campos)

## 2) O que falta (para "finalizar" o backend)

### A) Completar o contrato de API (shared/routes.ts)
O contrato define endpoints que ainda não existem no servidor:
- **Menu items**
  - `POST /api/menu-items` (create) — falta
  - `PUT /api/menu-items/:id` (update) — falta
  - `DELETE /api/menu-items/:id` (delete) — falta

- **Comandas**
  - `PUT /api/comandas/:id` (update) — falta no `server/routes.ts` (existe no contrato e existe no storage, mas não foi exposto)

### B) Regras de negócio (hoje está muito "crud")
Hoje o backend cria/finaliza pedidos, mas não aplica automaticamente regras importantes:
- Ao criar um pedido:
  - validar se a comanda existe e está disponível/ocupada
  - marcar comanda como **occupied** quando tiver pedido aberto
  - recalcular e persistir `comandas.total` (somando itens)
  - setar corretamente `orders.status` (ex.: open -> preparing se houver itens que vão para cozinha)
  - garantir consistência: **transação** (order + items + atualização da comanda)

- Ao finalizar (fechamento):
  - fechar o pedido e registrar `closedAt` e `receiptId`
  - liberar a comanda (voltar pra `available`)
  - zerar total e garantir que novos lançamentos não herdem dados antigos

- Itens de cozinha:
  - regras para transições de status (pending → preparing → ready → delivered / canceled)
  - separar claramente itens enviados à cozinha vs itens que não vão

### C) Autorização por papel (admin vs operação)
No momento, quase todas as rotas estão **sem proteção**.
Geralmente você vai querer:
- rotas de **admin** protegidas (categorias, menu, relatórios, etc.)
- rotas operacionais (garçom/cozinha/caixa) com proteção mais simples (token, pin, ou ao menos um "modo local")

### D) Realtime para dashboard/cozinha
O projeto tem dependência de `ws`, mas ainda não há uma camada real de eventos.
Para "dashboard em tempo real" e telas de cozinha/caixa sincronizadas, falta:
- WebSocket/SSE (ou polling bem feito) emitindo eventos de:
  - comanda ocupada/liberada
  - novo pedido / novo item de cozinha
  - mudança de status de item
  - fechamento

### E) Relatórios (PDF/Excel) com filtros
O frontend tem libs (`jspdf`, `xlsx`), mas o backend ainda não fornece:
- endpoints para gerar relatório consolidado por período, por comanda, por categoria, por status, etc.
- exportações server-side (opcional) ou pelo menos endpoints de consulta filtrada.

### F) Migração gradual do frontend (sem quebrar o offline)
Hoje o frontend só usa o backend para **snapshot**.
Para "finalizar", falta migrar as ações do Zustand para:
- quando `VITE_BACKEND_MODE=api`: chamar API
- quando `VITE_BACKEND_MODE=local`: continuar usando localStorage

A migração pode ser feita em etapas (uma feature por vez):
1) Comandas (ocupar/liberar + total)
2) Pedidos (criar e listar)
3) Cozinha (status em tempo real)
4) Admin (categorias/itens)
5) Relatórios

### G) Qualidade e robustez
Itens importantes para produção/local estável:
- validação Zod nas rotas (hoje não está aplicado em todas)
- tratamento de "not found" e retornos 404 coerentes
- paginação/filtros em listagens (orders/orderItems)
- índices no banco (order_items.orderId, orders.comandaId)

## 3) Próximos passos sugeridos (por partes, sem quebrar)

### Parte 1 (segura e pequena)
- Implementar os endpoints faltantes do contrato:
  - menu-items (create/update/delete)
  - comanda update
- Adicionar validação Zod e respostas 404.

### Parte 2 (regras de comanda/pedido)
- No `storage.createOrder`:
  - transação
  - atualizar total da comanda
  - marcar ocupada
- No `storage.finalizeOrder`:
  - liberar comanda e zerar total

### Parte 3 (realtime)
- Introduzir WebSocket e emitir eventos no create/update/finalize.

### Parte 4 (admin e relatórios)
- Proteger rotas de admin.
- Endpoints de consulta filtrada + export.

