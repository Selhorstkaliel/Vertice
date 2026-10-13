# VÉRTICE — Landing page

Página pública do VÉRTICE. Fica separada do aplicativo (o projeto Next.js na raiz do repositório) e leva o visitante até ele pelas rotas de acesso.

Stack: React 19, Vite, TypeScript (strict), Tailwind CSS 4, Framer Motion, Lucide e React Router.

## Comandos

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm run build      # typecheck, build do cliente, build de servidor e pré-renderização em dist/
npm run preview
```

## Pré-renderização

O `npm run build` gera o HTML de cada rota pública com `prerender.mjs`, e o JavaScript hidrata esse mesmo HTML no navegador. Buscadores, prévias de link e visitantes sem JavaScript recebem a página pronta, e o primeiro conteúdo aparece sem esperar o pacote carregar.

- As páginas vêm de `src/lib/pages.ts`, que também alimenta o sitemap e os metadados de cada rota.
- Cada rota gera dois arquivos (`recursos.html` e `recursos/index.html`), porque cada hospedagem estática resolve o endereço sem barra final de um jeito.
- `404.html` é gerado para endereços desconhecidos.
- A entrada do hero é feita em CSS, não em JavaScript, para o texto ser pintado no primeiro quadro.

Na hospedagem, sirva os arquivos como estão e aponte a página de erro para `404.html`. Não configure um *fallback* que devolva `index.html` para qualquer endereço: isso serviria a home no lugar da página certa.

## Publicação na Vercel

O projeto já vem com `vercel.json`. No painel da Vercel, crie o projeto apontando para este repositório e defina **Root Directory** como `landing`. O restante é automático: build, `cleanUrls` (os endereços ficam sem `.html`), cache longo para os arquivos com hash e cabeçalhos básicos de segurança.

Sem `VITE_SITE_URL`, o build usa o endereço de produção do próprio projeto na Vercel para o canonical, o `og:url` e o sitemap. Ao ligar um domínio próprio, defina `VITE_SITE_URL` com ele.

## Variáveis de ambiente

Copie `.env.example` para `.env`.

| Variável | O que faz |
|---|---|
| `VITE_SITE_URL` | Endereço público da landing. Com ele, o build gera `canonical`, `og:url`, `og:image` absoluto, `sitemap.xml` e a linha `Sitemap` do `robots.txt`. Sem ele, nada disso é gerado. |
| `VITE_APP_URL` | Endereço do aplicativo. Com ele, `/login`, `/cadastro` e `/dashboard` levam para `/entrar`, `/cadastro` e `/painel` no app. Sem ele, essas páginas informam que o acesso ainda não está disponível. |

## Conteúdo editável

Nenhum número, preço ou depoimento fica escrito nos componentes.

| Arquivo | Conteúdo |
|---|---|
| `src/data/pricing.ts` | Planos, recursos e preços. `null` mostra "Em breve". Com `pricingConfig.published` em `false`, a seção esconde o alternador de cobrança e mostra `draftNotice`. |
| `src/data/testimonials.ts` | Depoimentos verificados. Com a lista vazia, a seção não aparece no build de produção. |
| `src/data/demo.ts` | Todos os dados das telas demonstrativas. Toda tela que os usa exibe a etiqueta "Dados demonstrativos". |
| `src/data/faq.ts` | Perguntas frequentes. |
| `src/data/legal.ts` | Termos de uso, política de privacidade e textos de contato. Preencha `controller` e `contactEmail` em `legalConfig`; `published` remove o aviso de documento fora de vigor. |
| `src/data/contests.ts` | Categorias e exemplos de concursos, com o aviso de não afiliação. |
| `src/data/navigation.ts` | Navegação, rodapé e redes sociais (a coluna Social só aparece com URLs reais). |
| `src/lib/routes.ts` | Rotas e âncoras. O sitemap usa a lista em `seo.config.ts`. |

## Estrutura

```
src/
  animations/   variantes e componentes de entrada (Reveal)
  components/
    layout/     Navbar, Footer, Layout, PageIntro
    sections/   uma seção da landing por arquivo
    mockups/    telas demonstrativas do produto
    ui/         Button, Section, Badge, Accordion, gráficos, janelas
  data/         conteúdo editável
  hooks/        metadados da página, scroll, contagem animada
  lib/          rotas, site, formatação, plano demonstrativo
  pages/        páginas do roteador
  routes.tsx    rotas compartilhadas pelo navegador e pela pré-renderização
  entry-server.tsx  renderização de cada rota no build
```

## Antes de publicar

- Definir `VITE_SITE_URL` e `VITE_APP_URL`.
- Publicar valores em `src/data/pricing.ts` ou manter "Em breve".
- Preencher `legalConfig` em `src/data/legal.ts` (responsável e e-mail de contato) e submeter termos e política à revisão jurídica antes de marcar `published: true`.
- Conferir na hospedagem que os arquivos pré-renderizados são servidos por rota e que a página de erro aponta para `404.html`.
