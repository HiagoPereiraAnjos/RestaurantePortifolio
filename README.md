# Sistema Restaurante — Passo a passo para iniciantes

Este guia é para quem nunca rodou o projeto antes. Siga na ordem.

---

## 1) O que você precisa instalar

1. **Node.js LTS (18+)**
   - Verifique no CMD:
   ```
   node -v
   npm -v
   ```

2. **PostgreSQL** (ou Docker)
   - Se usar Docker, siga a seção 4.

---

## 2) Baixar o projeto

Se você já tem a pasta do projeto:
```
cd C:\caminho\para\o\projeto
```

Se for clonar:
```
git clone <seu-repo>
cd <pasta-do-projeto>
```

---

## 3) Criar o arquivo .env

Na raiz do projeto, crie o arquivo `.env` com este conteúdo:
```
PORT=5000
HOST=0.0.0.0
VITE_BACKEND_MODE=api
JWT_SECRET=coloque_um_segredo_forte_com_32+_chars
DATABASE_URL=postgresql://postgres:1308@localhost:5432/restaurant
```

Se você não quiser dados padrão ao iniciar:
```
SEED_ON_STARTUP=false
```

---

## 4) (Opcional) Subir Postgres com Docker

Se você **não** tem Postgres instalado, use Docker:
```
docker compose up -d
```

Isso sobe o Postgres local para o `DATABASE_URL` padrão.

---

## 5) Instalar dependências

No CMD, dentro da pasta do projeto:
```
npm install
```

---

## 6) Criar as tabelas no banco

```
npm run db:push
```

---

## 7) Rodar o sistema no navegador (modo dev)

```
npm run dev
```

Abra no navegador:
- PDV: `http://localhost:5000`
- Cozinha: `http://localhost:5000/cozinha`
- Caixa: `http://localhost:5000/caixa`
- Admin: `http://localhost:5000/admin`

Login Admin:
- usuário: `admin`
- senha: `admin`

---

## 8) Gerar instalador (Electron)

```
npm run electron:build
```

Arquivos gerados:
- Instalador: `dist-electron\Sistema Restaurante Setup 1.0.0.exe`
- Portável: `dist-electron\win-unpacked\Sistema Restaurante.exe`

---

## 9) Usar o app instalado (produção local)

1. Execute o instalador.
2. Abra o atalho **Sistema Restaurante** no Desktop ou Menu Iniciar.
3. Ele abre direto no **Caixa**.
4. Se não abrir janela, procure o ícone na bandeja (tray).

---

## 10) Acesso pelo celular (mesma rede Wi‑Fi)

1) Descubra o IP do PC:
```
ipconfig
```

2) No celular:
```
http://IP_DO_PC:5000
```

---

## 11) Solução de problemas

### Porta 5000 ocupada
```
netstat -ano | findstr :5000
taskkill /F /PID <PID>
```
Ou altere `PORT` no `.env`.

### App não abre janela
- Verifique o ícone da bandeja.
- Clique em **Abrir Caixa**.

### Banco não conecta
- Verifique `DATABASE_URL`.
- Confirme se o Postgres está rodando.

### Build Electron dá erro de acesso negado
- Feche instâncias do app.
- Apague `dist-electron` e rode:
```
npm run electron:build
```

---

## 12) Mais detalhes
Consulte:
- `LOCAL_SETUP.md`
- `BACKEND_NOTES.md`
- `BACKEND_GAPS.md`
