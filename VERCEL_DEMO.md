# Demo Portfolio na Vercel

Este projeto foi preparado para deploy como **demo frontend-only** na Vercel.

## O que muda no modo demo

- Build usa `VITE_BACKEND_MODE=local`.
- Nenhum backend/DB é necessário na Vercel.
- Dados ficam no `localStorage` do navegador.

## Comando local para testar a demo

```bash
npm run build:vercel
npm run preview
```

## Deploy na Vercel

1. Suba o repositório no GitHub.
2. Na Vercel: `Add New Project` -> selecione o repo.
3. Build command: `npm run build:vercel`.
4. Output directory: `dist/public`.
5. Deploy.

O arquivo `vercel.json` já deixa isso pré-configurado e também faz rewrite SPA para rotas:

- `/`
- `/caixa`
- `/cozinha`
- `/admin`
- `/comandas`

## Credenciais da demo

- Usuário admin: `admin`
- Senha admin: `admin`

No modo local, a senha pode ser alterada no próprio app e fica salva no navegador.

## Observações de portfolio

- Reabrir a demo no mesmo navegador mantém dados salvos localmente.
- Para "resetar" a demo, limpe o storage/site data do domínio da Vercel.
