# MercadoHub

Painel pessoal de ações da B3: busca por ticker, gráfico de até 5 anos, carteira com preço médio e comparação com o Ibovespa, lista de acompanhamento com preço-alvo, alerta e preço justo de Graham.

- `index.html` — o painel (React, sem etapa de build).
- `netlify/functions/cotacao.mjs` — `/api/cotacao?t=ITUB4&range=1y` (Yahoo Finance).
- `netlify/functions/fundamentos.mjs` — `/api/fundamentos?t=ITUB4` (Fundamentus).
- Carteira e lista ficam no navegador (localStorage). Use "Exportar backup" para guardar.

Fontes não oficiais: se uma delas mudar de formato, só a função correspondente precisa de ajuste.
