# Identidade OmniPDV

Símbolo original criado para o OmniPDV: um O branco aberto e um detalhe verde-claro, sobre um quadrado verde arredondado. A marca representa integração e continuidade da operação da loja.

- `omnipdv-original.png`: imagem original gerada para a marca, com transparência externa.
- `icon-1024.png`, `icon-512.png`, `icon-256.png`: exportações para uso no aplicativo, documentação e empacotamento.
- `omnipdv.ico`: ícone Windows com quadros de 16, 24, 32, 48, 64, 128 e 256 pixels.

As exportações apenas redimensionam/convertem a imagem original. O login e o menu compõem o símbolo com o nome OmniPDV em texto, legível também em telas pequenas. O mesmo símbolo aparece nos recibos.

O Electron deve receber `icon` na janela e o electron-builder deve editar os recursos PE. Use `win.signExecutable: false` para builds sem assinatura digital; **não desative `signAndEditExecutable`**, pois isso também impede a aplicação do ícone e dos metadados. O workflow confere os sete tamanhos dentro do executável com `scripts/verify-windows-icon.mjs` antes de disponibilizar o instalador.

O appId e o diretório de dados `pdv-sistem` são mantidos por compatibilidade com versões anteriores. São identificadores técnicos, não o nome exibido ao usuário.
