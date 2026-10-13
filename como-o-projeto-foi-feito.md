# Como o projeto foi feito

## Visão geral

O projeto usa frontend React com TypeScript, API Express organizada em MVC e armazenamento SQLite. O navegador consome a API REST; os modelos encapsulam o acesso aos dados, os controladores aplicam validações e regras de negócio, e as rotas conectam HTTP às ações correspondentes.

## Tecnologias

- **React e TypeScript** no frontend em `frontend/src`, construído pelo Vite.
- **Node.js e Express** na API REST e entrega dos assets de produção. [server.js](./server.js) inicia o servidor e [src/app.js](./src/app.js) compõe a aplicação.
- **MVC no backend:** `src/models` contém o acesso SQLite, `src/controllers` trata as operações e validações HTTP, `src/routes` declara os endpoints, e `src/services` concentra a leitura e validação de arquivos importados.
- **SQLite**, acessado com `better-sqlite3`, para armazenamento persistente em `database/sorteio.sqlite`.
- **Multer** para receber arquivos enviados pelo formulário.
- **CSV Parse** para interpretar arquivos CSV.
- **ExcelJS** para ler planilhas `.xlsx`.
- **`node:test`** para os testes de integração do servidor em [tests/server.test.js](./tests/server.test.js).

O arquivo de dependências e os comandos estão em [package.json](./package.json).

## Como iniciar

É necessário ter Node.js 20.19 ou superior instalado.

```powershell
npm install
npm start
```

Depois, abra `http://127.0.0.1:3000` no navegador. `npm start` compila o frontend para produção antes de iniciar o servidor. O servidor escuta apenas na máquina local por padrão. A primeira inicialização cria a pasta `database`, o banco SQLite e os 12 participantes fornecidos originalmente. Os participantes padrão são adicionados apenas na criação inicial do banco; se a lista for esvaziada depois, ela continua vazia após reiniciar o servidor.

Durante o desenvolvimento, inicie `npm run dev:api` e `npm run dev` em terminais separados. O Vite serve o frontend com HMR em `http://127.0.0.1:5173` e encaminha `/api` ao Express.

Para executar os testes:

```powershell
npm test
```

Para validar o frontend TypeScript separadamente:

```powershell
npm run typecheck
```

## Interface

O frontend tem quatro abas:

1. **Sorteio:** exibe os participantes cadastrados, configura a divisão e apresenta os grupos. Em desktop, usa duas colunas equivalentes; em telas estreitas, empilha os painéis.
2. **Participantes:** permite cadastrar, editar e excluir nomes; também importa arquivos CSV, TXT e XLSX.
3. **Histórico:** lista as gerações salvas e abre seus resultados, inclusive após reiniciar o servidor.
4. **Banco SQLite:** permite consultar os registros atuais das tabelas e resume seus relacionamentos.

## Cadastro e importação

Participantes podem ser incluídos pelo formulário ou carregados de um arquivo de até 5 MB:

- CSV separado por vírgula, ponto e vírgula ou tabulação;
- texto simples, com um nome por linha;
- Excel `.xlsx`, usando a primeira aba.

O arquivo pode usar uma coluna chamada `Nome` (também são reconhecidos `Name`, `Participante` e `Participant`). Sem esse cabeçalho, o aplicativo lê a primeira coluna. A importação **adiciona** nomes novos e ignora nomes já cadastrados, sem substituir a lista. Nomes são obrigatórios, limitados a 120 caracteres e comparados sem diferenciar maiúsculas/minúsculas.

A API rejeita duplicidade de cadastro, inclusive quando o nome já existe em caixa diferente. A exclusão remove o cadastro atual, mas não apaga nomes dos sorteios históricos.

## API do backend

| Método | Rota | Função |
|---|---|---|
| `GET` | `/api/health` | Verifica se a API está ativa. |
| `GET` | `/api/database` | Lista os registros atuais das tabelas SQLite principais. |
| `GET` | `/api/participants` | Lista participantes cadastrados. |
| `POST` | `/api/participants` | Cadastra um participante. |
| `PUT` | `/api/participants/:id` | Altera o nome cadastrado. |
| `DELETE` | `/api/participants/:id` | Exclui o cadastro, preservando cópias nos resultados anteriores. |
| `POST` | `/api/participants/import` | Importa nomes enviados como formulário multipart. |
| `GET` | `/api/draws` | Lista as gerações salvas. |
| `POST` | `/api/draws` | Sorteia e grava uma nova geração. |
| `GET` | `/api/draws/:id` | Recupera uma geração e seus grupos. |
| `PATCH` | `/api/draws/:id/swap` | Troca dois membros entre grupos na geração indicada. |

Os erros de validação e de negócio são retornados como respostas JSON com mensagem adequada. O servidor exibe erros inesperados no console e responde com status HTTP 500.

## Como o sorteio funciona

1. O servidor lê do banco os participantes cadastrados.
2. Valida o modo e o número informado.
3. Embaralha os registros com Fisher–Yates e `crypto.randomInt`.
4. Distribui todos os participantes em grupos; quando a quantidade não é divisível, alguns grupos ficam com uma pessoa a mais ou um grupo final fica menor.
5. Salva a geração, os grupos e os membros em uma transação SQLite.

Cada participante tem um identificador próprio. Isso permite nomes repetidos em resultados históricos sem depender do nome para identificar a pessoa e dá ao arrastar-e-soltar uma referência persistente.

## Troca por arrastar e soltar

Cada participante no resultado pode ser arrastado para outra pessoa de outro grupo. Também é possível selecionar duas pessoas por clique ou teclado. O frontend envia a troca à API; o servidor verifica que ambos pertencem à geração e estão em grupos diferentes, e atualiza as duas posições em uma transação.

Os cartões são atualizados com a resposta persistida pelo backend. Portanto, recarregar a página ou abrir o histórico não desfaz uma troca.

## Estrutura do banco

- `participants`: cadastro atual, nome normalizado para impedir duplicidade, datas de criação e atualização.
- `draws`: configuração e data de cada geração.
- `draw_groups`: grupos pertencentes a cada geração.
- `draw_members`: membros, posição, grupo e cópia do nome no momento do sorteio.
- `app_metadata`: marca a inicialização para evitar cadastrar novamente os nomes padrão em reinicializações futuras.

As tabelas de histórico preservam uma cópia do nome sorteado. A referência opcional para `participants` passa a nula quando um cadastro é excluído (`ON DELETE SET NULL`), sem apagar o membro histórico. Trocas de grupo só alteram o grupo e a posição dos dois membros selecionados.

## Limites e armazenamento

- O histórico é persistido no banco do servidor, não no `localStorage` do navegador.
- O banco padrão fica em `database/sorteio.sqlite`; configure `DB_PATH` para usar outro caminho.
- `PORT` altera a porta padrão 3000; `HOST` altera o endereço de escuta, cujo padrão é `127.0.0.1`.
- A listagem do histórico retorna as 100 gerações mais recentes.
- Cada arquivo de importação pode ter no máximo 5 MB e até 1000 nomes.
- Os snapshots de grupos e nomes antigos não são alterados quando o cadastro atual é renomeado.
