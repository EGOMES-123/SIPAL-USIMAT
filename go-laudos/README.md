# GO-LAUDOS 0.34.0

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

27 casos testam bridge, Executar, espera da tabela e manutenção de sessão. Para testar o DOM no Chromium, instale Playwright e disponibilize `/usr/bin/chromium`, então rode:

```sh
node tests/browser-smoke.cjs
```

O teste de DOM usa páginas locais simuladas e APIs Chrome simuladas no popup. Não instala a extensão nem acessa o SAP real. A instalação de extensões foi bloqueada pela política administrativa do navegador do ambiente de desenvolvimento. A integração SAP/Supabase autenticada e a renovação de sessão no servidor permanecem por validar no computador vinculado.

Não publique diagnósticos contendo dados de negócio ou credenciais. O pacote não inclui os diagnósticos do usuário nem dados de vínculo privados.

## Atualização e monitoramento (v0.34)

Implementação própria de recursos de atualização, sem incorporar código do Auto Refresh Plus. No popup, selecione uma aba na página inicial SAP (`/sap/bc/ui2/flp#Shell-home`). Intervalos mínimo e máximo iguais produzem intervalo fixo; valores diferentes sorteiam cada intervalo entre os dois limites. Mínimo de 30 segundos, respeitando o agendador do Chrome; padrão 240 segundos e limite de 10 recargas. A execução pode atrasar quando o computador suspende.

O motor usa alarmes e a mesma trava de concorrência da coleta. Não recarrega durante reserva de aba, execução ativa, manutenção de sessão, diálogo, edição ou carregamento. Pausa ao sair da página inicial, fechar a aba, detectar erro ou falhar três vezes ao inspecionar. Recarrega apenas a aba explicitamente selecionada, sem abrir novas janelas. Estado de execução fica no armazenamento de sessão do Chrome; não é retomado automaticamente após reiniciar o navegador.

Monitoramento compara SHA-256 do texto visível da página principal entre verificações. Só a assinatura e contadores ficam armazenados; o texto não é enviado à nuvem. Relógios e textos dinâmicos podem causar detecção. Ao atingir o limite de recargas, o monitoramento também encerra. A última recarga não é comparada após esse encerramento. O botão Pausar atualização encerra apenas atualização e monitoramento; coleta e sessão têm controles próprios.

Essa função não comprova renovação da sessão SAP, não resolve HTTP 0 e não monitora dados internos de iframes. Mantenha as extensões separadas de atualização e sessão desativadas nesta aba para evitar automações concorrentes.
