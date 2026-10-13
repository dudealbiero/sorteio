# Sorteio de grupos

Aplicativo local em React e TypeScript para cadastrar participantes, importar arquivos, sortear grupos, trocar integrantes e consultar o histórico persistido em SQLite. O backend Express segue MVC, com modelos, controladores e rotas separados.

## Requisitos

- Node.js 20.19 ou superior
- npm

## Instalação e execução

No PowerShell, na pasta do projeto:

```powershell
npm install
npm start
```

Abra `http://127.0.0.1:3000`. O banco é criado automaticamente em `database/sorteio.sqlite`, com a lista inicial de 12 participantes.

Na primeira execução, configure `ADMIN_USERNAME` e `ADMIN_PASSWORD` no ambiente antes de iniciar o servidor. O nome deve ter de 3 a 40 caracteres (letras ASCII, números, ponto, hífen ou sublinhado), e a senha deve ter de 12 a 256 caracteres; a senha é armazenada usando scrypt. Por exemplo, no PowerShell:

```powershell
$env:ADMIN_USERNAME = "admin"
$env:ADMIN_PASSWORD = "uma-senha-segura-com-12-caracteres"
npm start
```

O administrador pode criar, redefinir a senha e excluir contas na aba **Usuários**. Cada conta mantém participantes, sorteios e histórico separados. As sessões usam cookie HttpOnly e expiram após oito horas. Em produção, o cookie também exige HTTPS.

Para desenvolvimento com atualização rápida do frontend, abra dois terminais:

```powershell
npm run dev:api
npm run dev
```

O Vite ficará em `http://127.0.0.1:5173` e encaminhará as chamadas `/api` ao backend em `http://127.0.0.1:3000`.

Validação de tipos e testes:

```powershell
npm run typecheck
npm test
```

`npm start` gera os arquivos de produção do frontend em `frontend/dist` e inicia o servidor Express.

## Recursos

- Cadastro manual de participantes, edição e exclusão.
- Importação de `.csv`, `.txt` e `.xlsx`; novos nomes são adicionados e duplicados ignorados.
- Sorteio por quantidade de grupos ou tamanho dos grupos.
- Drag and drop (ou seleção por clique/teclado) para trocar pessoas entre grupos.
- Histórico persistido, com recuperação de resultados antigos e trocas salvas.
- Dados atuais e estrutura do banco visíveis na aba **Banco SQLite**.
- Login com perfis de administrador e usuário, além de gestão de contas em uma tela separada.
- Isolamento dos participantes, sorteios e histórico por conta.

Veja [como-o-projeto-foi-feito.md](./como-o-projeto-foi-feito.md) para a arquitetura MVC, regras de importação, modelo SQLite e rotas da API.
