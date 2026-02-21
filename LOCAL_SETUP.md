## Pronto para rodar

Este projeto pode rodar 100% local (PC servidor no restaurante) com Postgres e API.

# Rodar localmente (Windows / rede local)

## 1) Banco Postgres (Docker)

1. Instale o Docker Desktop.
2. Na raiz do projeto:

```bash
docker compose up -d
```

Isso sobe um Postgres em `localhost:5432`.

## 2) Variaveis de ambiente

Crie um arquivo `.env` na raiz e ajuste:

```env
DATABASE_URL=postgresql://restaurant:restaurant@localhost:5432/restaurant
JWT_SECRET=troque-esse-segredo
PORT=5000
# Para acesso na rede local:
HOST=0.0.0.0
```

## 3) Criar tabelas (Drizzle)

```bash
npm install
npm run db:push
```

### Migracao de timezone (recomendada para banco com dados antigos)

Se o banco ja tinha dados no historico/recibo, rode a migracao abaixo
antes de iniciar o backend. Ela converte colunas legadas para `timestamptz`
interpretando os valores antigos como `America/Sao_Paulo`.

```bash
psql "%DATABASE_URL%" -f migrations/0003_timezone_guardrails.sql
```

### Migracao de comanda_id para FK real (recomendada para banco com dados antigos)

Essa migracao converte `orders.comanda_id` para referenciar `comandas.id`
e associa pedidos legados pela coluna `comandas.number`.

```bash
psql "%DATABASE_URL%" -f migrations/0004_orders_comanda_fk_to_comandas_id.sql
```

### Persistencia de recibos no banco (recomendada)

Cria e atualiza a tabela `receipts`, mantendo comprovantes no Postgres
mesmo que o cache/localStorage seja apagado.

```bash
psql "%DATABASE_URL%" -f migrations/0005_receipts_persistence.sql
```

## 4) Rodar o sistema

```bash
npm run dev
```

Abra:

- Local: `http://localhost:5000`
- Cozinha: `http://localhost:5000/cozinha`
- Caixa: `http://localhost:5000/caixa`
- Admin: `http://localhost:5000/admin`

## Login admin (API)

- usuario: `admin`
- senha: `admin`

Endpoints:

- `POST /api/auth/login`
- `POST /api/auth/reauth`
- `POST /api/auth/change-password` (Bearer token)

## Modo Full Stack (API)

No `.env`:

- `VITE_BACKEND_MODE=api`
