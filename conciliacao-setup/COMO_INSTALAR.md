# Conciliação Bonequim: como ligar

O app fica em **azpex-sistema.vercel.app/conciliacao.html**. Os dados ficam na planilha **CONCILIAÇÃO BONEQUIM**, no Drive da conta tatibonequim (abas CONTAGENS e ITENS).

São três partes, feitas uma vez só.

## 1. Apps Script dentro da planilha

1. Abra a planilha CONCILIAÇÃO BONEQUIM.
2. Menu **Extensões > Apps Script**.
3. Apague o que estiver escrito e cole todo o conteúdo do arquivo `apps-script.gs` desta pasta. Salve (ícone de disquete).
4. No seletor de função lá em cima, escolha **configurar** e clique em **Executar**. O Google vai pedir autorização: aceite com a conta tatibonequim.
5. Embaixo, no **Registro de execução**, aparece uma linha `SEGREDO (...): xxxxxxxx`. Copie esse código.
6. Clique em **Implantar > Nova implantação**. Em tipo, escolha **App da Web**.
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
7. Clique em Implantar e copie o **URL do app da Web** (termina em `/exec`).

## 2. Variáveis na Vercel

No projeto azpex-sistema da Vercel: **Settings > Environment Variables**. Crie:

| Nome | Valor |
|---|---|
| `CONCILIACAO_SCRIPT_URL` | o URL que termina em `/exec` |
| `CONCILIACAO_SEGREDO` | o SEGREDO do passo 1.5 |
| `CONCILIACAO_PINS` | opcional, pra trocar os PINs. Ex.: `{"ana":"1357","taty":"1234","carol":"2468"}` |

Depois de salvar as variáveis, faça um **Redeploy** pra elas valerem.

## 3. PINs

Sem a variável `CONCILIACAO_PINS`, os PINs são:

- Ana: 1357
- Taty: 1234
- Carol: 2468

Como este repositório é público, vale definir PINs próprios na variável.

## Se mudar o Apps Script depois

Cole o código novo, salve e vá em **Implantar > Gerenciar implantações > editar (lápis) > Versão: Nova versão > Implantar**. Assim o URL continua o mesmo e não precisa mexer na Vercel.

## Como as contagens andam

| STATUS na planilha | O que quer dizer |
|---|---|
| SOLICITADA | Taty ou Carol pediram pra contar |
| PENDENTE | Ana salvou e ainda está contando |
| AGUARDANDO APROVACAO | Ana finalizou |
| CORRIGIR | Taty ou Carol pediram correção, voltou pra Ana |
| CONCLUIDA | Aprovada. CONCILIADO_EM tem a data |

A aba ITENS tem uma linha por cor, com PP, P, M, G, GG e total. Dá pra filtrar por código ou por data de conciliação direto na planilha. Não apague nem mude a ordem das colunas: o app depende delas.
