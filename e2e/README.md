# E2E (Playwright)

## Pré-requisitos
- Dependências instaladas (`npm install`)
- Banco configurado (`DATABASE_URL`) com migrações aplicadas

## Instalação do navegador de teste
```bash
npm run test:e2e:install
```

## Executar
```bash
npm run test:e2e
```

Modo com navegador visível:
```bash
npm run test:e2e:headed
```

## Cenários cobertos
- Login no Admin e exportação de relatórios (PDF/Excel)
- Fluxo de histórico no Admin com pedido finalizado + split de pagamentos
