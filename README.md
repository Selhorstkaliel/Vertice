# Vértice

Plataforma de preparação autônoma para concursos públicos e militares: edital verticalizado, rotina e plano semanal adaptativo, questões, caderno de erros, flashcards com repetição espaçada, simulados, desempenho com Índice de Preparação, Mentor, calendário, metas e área militar com TAF.

Stack: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4, Prisma 6 e PostgreSQL 16.

## Requisitos

- Node.js 20.6 ou superior (desenvolvido com Node 24)
- Docker, para o PostgreSQL local (ou um PostgreSQL 16 próprio)

## Instalação

```bash
npm install
cp .env.example .env           # edite SESSION_SECRET antes de continuar
npm run db:up                  # sobe o PostgreSQL na porta 5433
npm run db:deploy              # aplica as migrações
npm run db:seed                # catálogo: bancas, concursos, disciplinas e tópicos
npm run provas -- importar     # questões das provas oficiais (precisa de GEMINI_API_KEY; veja abaixo)
npm run db:seed:demo           # opcional: conta de demonstração
npm run dev                    # http://localhost:3000
```

Gere o `SESSION_SECRET` com:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Dados do catálogo

`npm run db:seed` cria 9 bancas, 21 disciplinas com 265 tópicos e 18 concursos. O comando pode ser repetido sem duplicar nada. Ele não cria questões: o banco é formado só por questões de provas oficiais anteriores e por questões geradas no estilo delas, sempre revisadas antes de publicar.

Os concursos do catálogo vêm marcados como **não verificados**: não há datas, pesos, bancas nem notas de corte cadastrados, e a interface mostra "Informação não verificada" onde esses dados faltariam. O estudante pode personalizar o edital com os dados oficiais.

### Conta de demonstração

`npm run db:seed:demo` cria `demo@vertice.app` com a senha `demo-vertice-2026`. A conta recebe oito semanas de atividade simulada, gerada pelos próprios serviços da plataforma: plano, sessões, questões, flashcards, simulados, metas e TAF. As respostas simuladas usam as questões já publicadas no banco; rode o seed da demo depois de publicar questões.

- A conta exibe um aviso permanente de dados fictícios.
- Nome, senha e exclusão ficam bloqueados nela.
- Rodar o comando de novo recria a conta do zero.
- O script se recusa a rodar com `NODE_ENV=production`.

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | Sim | Conexão com o PostgreSQL. O `.env.example` já aponta para o `docker-compose.yml`. |
| `SESSION_SECRET` | Sim | Pelo menos 32 caracteres. Assina os tokens de sessão e de recuperação de senha. O valor de exemplo é recusado em produção. |
| `NEXT_PUBLIC_APP_URL` | Não | URL pública, usada nos links de recuperação de senha. Padrão: `http://localhost:3000`. |
| `MENTOR_PROVIDER` | Não | Provedor de IA do Mentor: `gemini`, `anthropic` ou `openai-compatible`. Padrão: `anthropic`. Sem provedor configurado, o Mentor oferece só análises automáticas calculadas com regras. |
| `GEMINI_API_KEY` | Com `gemini` | Chave do Google AI Studio. |
| `ANTHROPIC_API_KEY` | Com `anthropic` | Chave da Anthropic. |
| `MENTOR_BASE_URL` / `MENTOR_API_KEY` | Com `openai-compatible` | Endereço da API (por exemplo, Groq ou Ollama) e chave, se o provedor exigir. |
| `MENTOR_MODEL` | Não | Modelo usado. Padrão: `gemini-3.5-flash-lite` com Gemini e `claude-opus-5` com Anthropic; obrigatório com `openai-compatible`. |
| `MENTOR_EFFORT` | Não | Profundidade de raciocínio: `low`, `medium` ou `high` (Claude aceita também `xhigh` e `max`). Vazio usa o padrão do provedor. |
| `MENTOR_DAILY_LIMIT` | Não | Mensagens com IA por estudante por dia. Padrão: `60`. |
| `QUESTION_AI_MODELS` | Não | Modelos do Gemini, em ordem, que leem as provas e geram questões. Quando a cota diária gratuita de um acaba, o próximo assume. Usa a mesma `GEMINI_API_KEY`, qualquer que seja o provedor do Mentor. Padrão: `gemini-3.5-flash-lite,gemini-3.6-flash`. |
| `STORAGE_DIR` | Não | Pasta dos PDFs importados, páginas renderizadas e figuras das questões. Fica fora da pasta pública e precisa entrar no backup. Padrão: `storage`. |
| `MENTOR_FALLBACKS` | Não | Só Anthropic. `default` pede à API que refaça em um modelo reserva uma resposta recusada pelos filtros de segurança (recurso beta). `off` desliga. Se a conta não tiver acesso ao beta, o Mentor detecta e segue sem ele. Padrão: `default`. |

As variáveis são validadas na inicialização. Uma variável obrigatória ausente ou inválida impede o servidor de subir, com uma mensagem indicando qual.

Com um provedor configurado, as mensagens do Mentor e os dados consultados para respondê-las são enviados a ele. As páginas do Mentor e de Configurações informam ao estudante qual é o provedor. No plano gratuito da API do Gemini, o Google pode usar esse conteúdo para melhorar os próprios produtos; para dados reais de estudantes, prefira um plano pago ou outro provedor.

### Mentor com Gemini (gratuito)

1. Crie uma chave em https://aistudio.google.com/apikey.
2. No `.env`, defina `MENTOR_PROVIDER="gemini"` e `GEMINI_API_KEY="sua-chave"`.
3. Rode `npm run mentor:check` para confirmar a chave, o modelo e uma resposta completa com a conta demo.

No plano gratuito, cada modelo tem uma cota diária própria, e cada mensagem ao Mentor usa de 2 a 4 pedidos (um por rodada de consulta aos dados). Modelos Flash-Lite costumam ter cota bem maior que os Flash; por isso o padrão é `gemini-3.5-flash-lite`. Consulte as cotas da sua chave em https://aistudio.google.com e, quando a cota diária acaba, o Mentor avisa o estudante e as análises automáticas continuam funcionando.
4. Reinicie o servidor.

## Banco de questões a partir de provas oficiais

Todas as questões do banco vêm de provas anteriores publicadas pelos próprios órgãos (Marinha, Exército, Força Aérea, ITA e IME) ou são geradas por IA no estilo delas. Nada é copiado de bancos comerciais de questões.

### Como uma prova vira questões

1. **Importação.** Pela tela `/admin/provas` (envio do PDF ou endereço oficial) ou pelo comando `npm run provas -- importar`, que usa a lista `prisma/provas-oficiais.json`. O gabarito oficial é importado junto; prefira o definitivo.
2. **Leitura.** A IA do Gemini lê o gabarito e transcreve as questões em lotes, com fórmulas em LaTeX e a posição de cada figura. As figuras são recortadas automaticamente da página.
3. **Conferências automáticas.** A resposta de cada questão vem sempre do gabarito oficial. Questões anuladas saem da fila. A IA resolve cada questão sem ver o gabarito e, quando chega a outra letra, a explicação é refeita a partir do gabarito e a questão fica marcada para revisão. Números da transcrição que não aparecem no texto do PDF, figuras e textos corrompidos também viram pendências.
4. **Revisão.** Um administrador confere cada questão ao lado da prévia de como o aluno verá, ajusta o recorte das figuras (arrastando sobre a página) e publica. O botão "Publicar sem pendências" publica de uma vez as que passaram por todas as conferências.
5. **Para o aluno.** A questão aparece como "Prova oficial", com concurso, ano, versão e número. A resolução traz o aviso de que foi escrita com IA e conferida com o gabarito.

Questões geradas (`/admin/geradas`) usam as questões oficiais publicadas de cada concurso como referência de estilo, passam por uma resolução independente e por uma checagem de semelhança com as oficiais, e aparecem para o aluno como "Gerada por IA", nunca como oficiais.

### Comandos

```bash
npm run provas -- admin voce@exemplo.com       # dá acesso a /admin/provas para uma conta existente
npm run provas -- importar                     # baixa e lê as provas de prisma/provas-oficiais.json
npm run provas -- importar --concurso=efomm    # só um concurso da lista
npm run provas -- continuar                    # retoma leituras pausadas pelo limite diário
npm run provas -- situacao                     # resumo por prova
npm run provas -- reverificar                  # reaplica gabarito e conferências nas provas já lidas
npm run provas -- publicar                     # publica as questões sem nenhuma pendência
npm run provas -- limpar                       # apaga figuras e páginas que nenhuma questão usa
npm run provas -- arquivo efomm 2026 "2º dia, prova branca" prova.pdf gabarito.pdf --fonte=URL
```

A lista aceita PDFs dentro de arquivos ZIP oficiais (`https://…/provas.zip#pasta/prova.pdf`). Alguns sites, como o da Força Aérea, só abrem no navegador: baixe os PDFs e rode `importar --pasta=<pasta do download>`.

### Custo e cota

Uma prova de 40 a 50 questões usa cerca de 15 a 20 pedidos à IA: o gabarito, 3 ou 4 lotes de transcrição e a resolução em lotes com raciocínio. No plano gratuito, a cota diária por modelo acaba depois de algumas provas. Tudo é salvo lote a lote; quando a cota acaba, a leitura pausa e `npm run provas -- continuar` (ou o botão "Retomar leitura") segue de onde parou no dia seguinte.

As provas, páginas e figuras ficam em `STORAGE_DIR`. Os PDFs são enviados ao Google só para a leitura; nenhum dado de estudante vai junto.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Gera o cliente Prisma e o build de produção |
| `npm start` | Serve o build de produção |
| `npm test` | Testes unitários dos motores de cálculo (plano, revisão, índice, metas, TAF, marcos) |
| `npm run test:provas` | Teste de ponta a ponta do banco de questões: importação, leitura, revisão, publicação, visão do aluno e geração, contra uma IA simulada. Precisa do `npm run build`, do PostgreSQL do Docker e da conta demo; apaga tudo o que cria. |
| `npm run lint` | ESLint |
| `npm run typecheck` | Verificação de tipos |
| `npm run db:up` / `db:down` | Sobe ou para o PostgreSQL do Docker |
| `npm run db:deploy` | Aplica as migrações pendentes |
| `npm run db:migrate` | Cria uma nova migração a partir do `schema.prisma` (desenvolvimento) |
| `npm run db:seed` | Catálogo de referência |
| `npm run db:seed:demo` | Conta de demonstração |
| `npm run mentor:check` | Verifica o Mentor com o provedor de IA configurado: chave, modelo e uma resposta completa com a conta demo. Usa cota ou tokens reais. |
| `npm run provas -- <comando>` | Importação, leitura e situação das provas oficiais (veja a seção acima) |
| `npm run db:studio` | Prisma Studio |
| `npm run db:reset` | Apaga o banco, reaplica as migrações e roda o seed do catálogo |

## Estrutura

```
prisma/            schema, migrações, catálogo, lista de provas oficiais e seeds
scripts/           comandos de linha: provas oficiais e verificação do Mentor
storage/           PDFs importados, páginas e figuras (fora do git)
src/app/           rotas: (marketing), (auth), (app) e api
src/components/    interface por área e primitivos em ui/
src/engines/       regras puras e testadas: rotina, prioridade, cronograma,
                   repetição espaçada, índice, adaptação, metas, TAF, marcos
src/modules/       serviços, consultas e server actions por domínio
src/lib/           banco, ambiente, datas com fuso horário, formatação e rótulos
```

Toda consulta é filtrada pelo usuário da sessão e toda ação valida a entrada no servidor. Sugestões do planejador e do Mentor nunca alteram a rotina ou o plano sem a decisão do estudante, exceto os ajustes pequenos que ele autorizar nas Configurações.

## Produção

- Use HTTPS. Em produção o cookie de sessão é `__Host-vertice_session`, que exige conexão segura.
- Defina `NODE_ENV=production`, um `SESSION_SECRET` próprio e `NEXT_PUBLIC_APP_URL` com o domínio real.
- Rode `npm run db:deploy` antes de iniciar a nova versão.
- Coloque a aplicação atrás de um proxy reverso que sobrescreva o cabeçalho `X-Forwarded-For`. O limite de tentativas por IP usa esse cabeçalho, e um cliente pode forjá-lo quando acessa o servidor diretamente. O limite por conta continua valendo mesmo nesse caso.
- Os limites de tentativas ficam no PostgreSQL e valem para todas as instâncias da aplicação ao mesmo tempo.
- Para ativar o Mentor com IA, configure o provedor e rode `npm run mentor:check` uma vez antes de liberar para os estudantes.
- A leitura de provas roda em segundo plano dentro do servidor Node (`npm start`). Em hospedagem serverless, use `npm run provas` numa máquina com acesso ao banco. `STORAGE_DIR` precisa ser um disco persistente e compartilhado entre as instâncias.

## Limitações conhecidas

- **E-mail:** não há provedor de e-mail configurado. Em desenvolvimento, o link de recuperação de senha é impresso no terminal do servidor. Para produção, implemente o envio em `src/modules/auth/mailer.ts`.
- **Provas oficiais:** a EEAR publica no site oficial só os gabaritos, não os cadernos de prova; essas provas precisam ser enviadas pela tela quando houver o PDF. Arquivos RAR (provas antigas da EsPCEx) não são lidos; extraia os PDFs e use a tela ou `npm run provas -- arquivo`. Os recortes automáticos de figuras são aproximados e precisam de conferência.
- **Foto de perfil:** fica no banco como imagem pequena (256 px, até 150 KB). Para muitos usuários, prefira um armazenamento de arquivos.
