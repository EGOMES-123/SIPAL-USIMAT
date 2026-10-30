# GO-LAUDOS 0.33.0

Extensão Chrome Manifest V3 com coletor SAP, fila assinada e assistência de sessão integrados. Atualização: veja [ATUALIZAR.txt](ATUALIZAR.txt).

## Integração

O login e o reconhecimento da lupa foram adaptados da extensão SAP Sessão Automática 0.10.9 fornecida pelo usuário. A gestão de janelas e os cliques via debugger foram substituídos por uma aba auxiliar que usa a mesma reserva do coletor. Não exige a permissão debugger. E-mail configurável no popup; senha permanece sob controle do Chrome.

A manutenção reutiliza a aba auxiliar, preserva redirecionamentos Microsoft e não interfere em coleta ativa nem em envios pendentes. A coleta pode suspender uma manutenção em andamento. O login tem limite de espera e retomada manual. Abas alteradas para outros sites não são navegadas nem fechadas automaticamente.

O Executar reconhece rótulos PT/EN e o SID específico da barra SAP. Campos de filtro são procurados em metadados por SID, sem depender do índice 21. Somente um candidato habilitado é acionado. Confirmação da busca e chegada da tabela são estados separados. Ao reconectar uma sessão expirada, o estado antigo do Executar é limpo para permitir consultar novamente, mantendo as capturas existentes.

## Verificação

Sem dependências externas:

```sh
for file in tests/*.test.cjs; do node "$file" || exit; done
```

17 casos testam bridge, Executar, espera da tabela e manutenção de sessão. Para testar o DOM no Chromium, instale Playwright e disponibilize `/usr/bin/chromium`, então rode:

```sh
node tests/browser-smoke.cjs
```

O teste de DOM usa páginas locais simuladas e APIs Chrome simuladas no popup. Não instala a extensão nem acessa o SAP real. A instalação de extensões foi bloqueada pela política administrativa do navegador do ambiente de desenvolvimento. A integração SAP/Supabase autenticada e a renovação de sessão no servidor permanecem por validar no computador vinculado.

Não publique diagnósticos contendo dados de negócio ou credenciais. O pacote não inclui os diagnósticos do usuário nem dados de vínculo privados.
