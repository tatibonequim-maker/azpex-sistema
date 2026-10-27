# Conciliação: como ligar

O app fica em **azpex-sistema.vercel.app/conciliacao**. Todos os apps ficam reunidos em **azpex-sistema.vercel.app/acesso**. Os dados ficam na planilha **CONCILIAÇÃO BONEQUIM**, no Drive da conta tatibonequim (abas CONTAGENS e ITENS).

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
| `CONCILIACAO_PINS` | o PIN de cada pessoa (o Claude passa o texto pronto no chat) |

Depois de salvar as variáveis, faça um **Redeploy** pra elas valerem.

## 3. Quem usa

| Pessoa | O que faz |
|---|---|
| Ana | conta a Fábrica |
| Edson | conta a Bonequim |
| Renan | conta a Bonequim |
| Rose | conta a Azpex |
| Gi | pede contagens da Bonequim |
| Taty | pede, conta e aprova em todos os lugares |
| Carol | pede, conta e aprova em todos os lugares |

Cada pessoa só vê as contagens do seu lugar. Taty e Carol veem os três e podem filtrar.

Os PINs ficam só na variável `CONCILIACAO_PINS` da Vercel, nunca neste repositório (ele é público). Pra trocar um PIN, edite essa variável e faça Redeploy.

## Se mudar o Apps Script depois

Cole o código novo, salve e vá em **Implantar > Gerenciar implantações > editar (lápis) > Versão: Nova versão > Implantar**. Assim o URL continua o mesmo e não precisa mexer na Vercel.

## Como as contagens andam

| STATUS na planilha | O que quer dizer |
|---|---|
| SOLICITADA | Taty, Carol ou Gi pediram pra contar |
| PENDENTE | quem conta salvou e ainda está contando |
| AGUARDANDO APROVACAO | quem conta finalizou |
| CORRIGIR | Taty ou Carol pediram correção, voltou pra quem conta |
| CONCLUIDA | Aprovada. CONCILIADO_EM tem a data |

A coluna LOCAL diz se a contagem é da FABRICA, BONEQUIM ou AZPEX. A aba ITENS tem uma linha por cor, com PP, P, M, G, GG e total. Dá pra filtrar por código ou por data de conciliação direto na planilha. Não apague nem mude a ordem das colunas: o app depende delas.
