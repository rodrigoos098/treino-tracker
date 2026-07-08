# Treino Tracker

PWA pessoal para acompanhar treinos (PPL/UL ou planos custom). Registra reps, carga, RPE e notas; salva no dispositivo (IndexedDB + localStorage) e mostra evolução. Funciona offline após a primeira visita.

## Funcionalidades (v2)

- **Hoje** — sessão ativa com timer de descanso, check por série, steppers +/−, warm-up, copiar série, PR toast e sugestão de progressão
- **Plano** — CRUD de treinos e exercícios, reordenação e alternativas
- **Evolução** — gráficos com filtro 30d / 90d / tudo e marcadores de PR
- **Histórico** — lista de sessões com duração, volume e resumo semanal
- **Config** — tema, descanso padrão, vibração, wake lock, backup JSON e lembrete semanal

Rotação dinâmica: após salvar um treino, a próxima abertura sugere o próximo plano da sequência (não amarra a dia da semana).

## Uso local

```bash
python -m http.server 8080
# ou
npx serve .
```

Acesse `http://localhost:8080`. O service worker só funciona em HTTPS ou `localhost`.

## Deploy no GitHub Pages

1. Push para `main`
2. **Settings → Pages → Deploy from branch → main / (root)**
3. URL: `https://SEU_USUARIO.github.io/treino-tracker/`

## Instalar (PWA)

- **Android:** menu → Adicionar à tela inicial / Instalar app
- **iPhone:** Compartilhar → Adicionar à Tela de Início

## Dados e backup

Chaves estáveis (`tt_plan_v1`, `tt_logs_v1`, `tt_cfg_v1`, `tt_sessions_v1`). Deploys do PWA **não** apagam o histórico.

Use **Config → Exportar backup** periodicamente. Há lembrete se o último export tiver mais de 7 dias.

## Plano padrão

Push → Pull → Legs → Upper → Lower (editável na aba Plano).

## Estrutura

```
treino-tracker/
├── index.html
├── css/app.css
├── js/
│   ├── app.js
│   ├── store.js
│   ├── plan.js
│   ├── session.js
│   ├── charts.js
│   ├── defaults.js
│   ├── utils.js
│   └── ui/
├── sw.js
├── manifest.webmanifest
├── icons/
└── README.md
```

Deploy estático (sem build). Módulos ES nativos.
