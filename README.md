# Treino Tracker

PWA pessoal para acompanhar o plano de treino PPL/UL. Registra reps e carga por exercício, salva tudo no `localStorage` do celular e mostra gráficos de evolução. Funciona offline após a primeira visita.

## Funcionalidades

- **Hoje** — detecta o dia da semana e abre o treino correspondente (Push, Pull, Legs, Upper, Lower)
- **Plano** — edite, adicione, remova, reordene exercícios e substitua por alternativas
- **Evolução** — gráficos de carga máxima, e1RM estimado e volume total
- **Config** — tema claro/escuro, exportar/importar backup JSON, reset de dados

## Uso local (sem deploy)

Abra `index.html` no navegador do celular ou use um servidor local:

```bash
# Python 3
python -m http.server 8080

# Node (npx)
npx serve .
```

Acesse `http://localhost:8080` no celular (mesma rede Wi-Fi).

> **Nota:** o service worker (modo offline) só funciona via HTTPS ou `localhost`.

## Deploy no GitHub Pages

1. Crie um repositório no GitHub (ex.: `treino-tracker`)
2. Envie os arquivos:

```bash
git add .
git commit -m "feat: treino tracker PWA"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/treino-tracker.git
git push -u origin main
```

3. No GitHub: **Settings → Pages → Source: Deploy from branch → main / (root)**
4. Aguarde alguns minutos e acesse `https://SEU_USUARIO.github.io/treino-tracker/`

## Instalar na tela inicial (PWA)

### Android (Chrome)
1. Abra a URL do app
2. Toque no menu (⋮) → **Adicionar à tela inicial** ou **Instalar app**

### iPhone (Safari)
1. Abra a URL do app
2. Toque em **Compartilhar** → **Adicionar à Tela de Início**

## Backup dos dados

Os dados ficam no `localStorage` do navegador. Se limpar os dados do site, perde tudo.

Use **Config → Exportar backup (JSON)** periodicamente e guarde o arquivo. Para restaurar: **Config → Importar backup**.

## Plano de treino incluído

| Dia     | Treino              |
|---------|---------------------|
| Domingo | Push (Empurrar)     |
| Segunda | Pull (Puxar)        |
| Terça   | Legs (Pernas)       |
| Quarta  | Descanso            |
| Quinta  | Upper (Superior)    |
| Sexta   | Lower (Inferior)    |
| Sábado  | Descanso            |

O plano é editável na aba **Plano**.

## Estrutura

```
treino-tracker/
├── index.html              # App completo (HTML + CSS + JS)
├── manifest.webmanifest    # Metadados PWA
├── sw.js                   # Service worker (cache offline)
├── icons/
│   ├── icon-192.png
│   ├── icon-512.png
│   └── icon-maskable-512.png
└── README.md
```

## Alternativas de deploy

- **Vercel:** `npx vercel` na pasta do projeto
- **Netlify Drop:** arraste a pasta em [app.netlify.com/drop](https://app.netlify.com/drop)
