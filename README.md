# Pastoral do Acolhimento – Santuário do Bugio

Painel web da coordenação: frequência, avisos, aniversariantes e cadastro de membros.
Node 20+, Express e Postgres (Supabase). As fotos e o logotipo ficam em disco (`data/uploads`).

## Como rodar

Crie um arquivo `.env` (ignorado pelo git) com a connection string do Supabase, em *Project Settings → Database → Connection string*. A conexão direta (`db.<ref>.supabase.co`) só tem IPv6; se a sua rede não tiver, use o **Session pooler** (porta 5432). Caracteres especiais na senha precisam ser codificados na URL (`@` vira `%40`, `#` vira `%23`):

```
DATABASE_URL=postgresql://postgres.<ref>:<senha>@aws-0-<regiao>.pooler.supabase.com:5432/postgres
```

```bash
npm install
npm run migrate      # cria/atualiza o banco (o `npm start` também migra sozinho)
npm run seed         # cria o usuário mestre com SUPERADMIN_EMAIL / SUPERADMIN_SENHA (do .env)
npm run seed:demo    # opcional: 6 membros de exemplo
npm start            # http://localhost:3000
npm test             # API (node:test); usa um schema temporário no mesmo banco e o apaga no fim
npm run e2e          # ponta a ponta no Chrome (usa o Google Chrome instalado)
```

`SUPERADMIN_EMAIL`/`SUPERADMIN_SENHA` definem o login do administrador criado pelo seed. `ADMIN_EMAIL`/`ADMIN_SENHA` criam, opcionalmente, uma coordenadora de exemplo (usado nos testes). Troque as senhas em Configurações.

## Cadastro, cargos e permissões

- **Cadastro público** (`#/cadastro`, link "Criar conta" no login): quem se cadastra entra **sempre como Usuário comum**. O servidor ignora qualquer cargo ou guia enviado no cadastro. O administrador pode fechar o cadastro na página Usuários.
- **Usuário comum** vê só: Início, Minha presença, Avisos, Galeria e Configurações.
- **Coordenação** vê tudo, menos a página Usuários. **Administrador** vê tudo, inclusive **Usuários**, onde muda o cargo de cada pessoa (Usuário, Coordenação, Administrador), libera ou bloqueia guias específicas, desativa contas e abre/fecha o cadastro. Trocar o cargo volta as guias ao padrão do novo cargo.
- A regra vale no servidor (403 na API), no menu e nas rotas.
- Quem tem só a guia Membros não promove ninguém nem edita contas da Coordenação. Publicar avisos, editar a mensagem de aniversário e gerir a Galeria são da Coordenação/Administrador, mesmo que outra pessoa receba a guia.
- Contas de administrador não entram na chamada, nos aniversários nem na lista de membros.

## Avisos e notificações

- **Avisos:** lista de cartões resumidos (com filtros Todos, Não lidos e Lidos, busca e categoria). Clicar abre o aviso em modal. Cada pessoa tem a sua flag de **lido / não lido**, no cartão e no modal; abrir o aviso marca como lido, e dá para voltar a "não lido". O menu mostra quantos avisos não foram lidos.
- **Novo aviso / editar:** só Coordenação e Administrador, em página própria (`#/avisos/novo`, `#/avisos/ID/editar`) com prévia ao vivo.
- **Sino:** sempre que sai um aviso novo, um evento novo ou fotos novas na Galeria, quem tem a guia daquele assunto recebe uma notificação (contador no sino e aviso na tela; atualiza a cada 30 s). Quem publicou não se notifica; quem se cadastra depois não recebe o que já passou. Abrir o aviso ou o evento tira a notificação do sino. Fotos enviadas logo após criar o evento entram na mesma notificação.

## Aparência (administrador)

Em **Configurações → Aparência** o administrador escolhe a **cor principal**, a **cor secundária** (há temas prontos) e envia o **logotipo** (PNG, JPG ou WebP até 2 MB; SVG não é aceito por segurança). A tela inteira muda ao vivo enquanto ele escolhe e só vale para todos ao salvar. O sistema recusa cor principal clara demais (texto branco ilegível) e secundária escura demais. O logotipo e as cores aparecem também na tela de login. "Restaurar padrão" volta tudo ao original. O menu lateral pode ser recolhido para só ícones (a escolha fica salva no navegador).

## Galeria

Coordenação e Administrador criam eventos, enviam várias fotos de uma vez (com título), definem a capa e editam ou excluem evento e fotos. Quem tem a guia Galeria vê os eventos, abre as fotos (com navegação por teclado) e baixa cada foto ou o evento inteiro em `.zip`.

## Migrations

Arquivos em `migrations/NNN_nome.sql`; a parte após `-- @down` é o rollback.

```bash
npm run migrate          # aplica as pendentes
npm run migrate:down     # desfaz o último lote
npm run migrate:status
```

| # | Conteúdo |
|---|---|
| 001 | `usuarios` (membro e usuário são a mesma entidade) |
| 002 | `sessoes`, `redefinicoes_senha` |
| 003 | `encontros`, `presencas` |
| 004 | `configuracoes` (limite de faltas, critério, mensagem de aniversário) |
| 005 | `avisos`, `avisos_leituras` |
| 006 | `auditoria` |
| 007 | `lancamentos` (financeiro) |
| 008 | `usuarios.superadmin` e `usuario_guias` (permissões) |
| 009 | configuração `cadastro_aberto` |
| 010 | guia `minha-presenca` em `usuario_guias` |
| 011 | `eventos`, `fotos` (galeria); `usuario_guias` passa a validar as guias na aplicação |
| 012 | `notificacoes`, `notificacoes_leituras` (sino) |
| 013 | configurações da marca (cores e logotipo) |

## O que cobre do PRD

- RF-01/18: login, sair, recuperar senha (o link aparece no console do servidor, pois não há e-mail local), perfil, foto e troca de senha com confirmação
- RF-02: perfis Coordenação e Membro (Membro vê painel, avisos e aniversariantes)
- RF-03: painel com indicadores, aniversariantes do dia e próximo evento
- RF-04 a 08: chamada por data e tipo de encontro, busca, "todos presentes", observação, rascunho local, limite de faltas (acumuladas ou consecutivas), análise, relatório por período, CSV e impressão
- RF-09/10 (parte): mensagem com `{nome}` e pré-visualização; envio automático (WhatsApp) não incluído
- RF-11 a 13: avisos com mídia, categoria, data do evento, fixar, autor e confirmação de leitura; entrega por WhatsApp/e-mail não incluída
- RF-14 a 16: CRUD, busca, filtro e inativar em vez de apagar
- RF-19/20: uma rota por tela (`#/frequencia/analise`) e auditoria de ações sensíveis
- RNF-01: consentimento no cadastro, exportar e apagar dados pessoais de um membro

Fora desta versão: RF-17 (importar planilha), envio por WhatsApp/e-mail e backup automático (copie `data/`).
