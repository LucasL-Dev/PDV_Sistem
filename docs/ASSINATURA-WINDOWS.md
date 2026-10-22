# Assinar OmniPDV com Azure Artifact Signing

O instalador NSIS e o executável OmniPDV podem ser assinados durante o build pelo Azure Artifact Signing (anteriormente Trusted Signing). O A1 fiscal não serve para isso. A assinatura identifica o publicador e protege a integridade dos arquivos; o SmartScreen também avalia reputação e políticas do computador. Portanto, nem mesmo uma assinatura válida garante ausência de avisos em todos os computadores. Não desative o SmartScreen.

## 1. Preparar o Azure

1. No portal Azure, use sua conta Artifact Signing com verificação de identidade concluída e um **Certificate Profile de confiança pública (Public Trust)**. Um perfil privado/de teste não resolve a confiança em computadores de clientes.
2. Copie o endpoint regional, nome da conta, nome do perfil e o nome exato do publicador no certificado. O endpoint tem formato `https://<região>.codesigning.azure.net/`; use o valor real do portal.
3. Crie ou reutilize uma identidade de aplicação no Microsoft Entra ID. Dê a ela a função de assinatura **Artifact Signing Certificate Profile Signer** (em interfaces antigas, **Trusted Signing Certificate Profile Signer**), limitada ao perfil/conta apropriado.
4. Na aplicação, configure uma credencial federada OIDC para GitHub Actions: organização/proprietário `LucasL-Dev`, repositório `PDV_Sistem`, tipo **Branch**, branch `main`, audiência `api://AzureADTokenExchange`. Não crie senha de cliente para este fluxo.
5. Copie o Application (client) ID, Directory (tenant) ID e Subscription ID. Se publicar por tags, cadastre também as credenciais federadas correspondentes às tags usadas; a confiança de `main` não cobre tags.

Referências: [integrações do Artifact Signing](https://learn.microsoft.com/azure/artifact-signing/how-to-signing-integrations) e [autenticação federada azure/login](https://github.com/Azure/login#login-with-openid-connect-oidc-recommended).

## 2. Configurar o GitHub

Em **Settings → Secrets and variables → Actions → Variables**, crie estas variáveis de repositório (são identificadores/configurações, não senhas):

| Variável | Conteúdo |
| --- | --- |
| `AZURE_CLIENT_ID` | Application/client ID da identidade federada |
| `AZURE_TENANT_ID` | Directory/tenant ID |
| `AZURE_SUBSCRIPTION_ID` | ID da assinatura Azure |
| `AZURE_SIGNING_ENDPOINT` | Endpoint HTTPS regional da conta |
| `AZURE_SIGNING_ACCOUNT` | Nome da conta Artifact Signing |
| `AZURE_SIGNING_PROFILE` | Nome do perfil Public Trust |
| `AZURE_SIGNING_PUBLISHER` | Nome exato do publicador no certificado |
| `OMNIPDV_AZURE_SIGNING` | `true` para exigir assinatura |

Ative a última variável somente depois de preencher as demais e configurar a federação/permissões. Nenhum certificado, token ou senha deve ser enviado pelo chat ou versionado no repositório.

## 3. Gerar e conferir

1. Execute **Actions → Instalador Windows → Run workflow**, selecionando `main`.
2. Confira os passos **Autenticar no Azure para assinatura** e **Validar assinatura Authenticode**.
3. Com `OMNIPDV_AZURE_SIGNING=true`, falhas de autenticação, assinatura ou validação impedem a entrega do artefato. Não existe fallback silencioso para instalador sem assinatura.
4. Baixe o novo artefato **Instalador-Windows** da execução verde. Instaladores antigos continuam sem assinatura; não basta renomear o arquivo.
5. No Windows, clique com o botão direito no instalador → **Propriedades → Assinaturas Digitais**. A assinatura deve estar válida e identificar seu publicador. O workflow verifica tanto o instalador como o executável instalado e gera SHA-256 após a assinatura.

Sem a variável de ativação, o workflow continua gerando builds de teste **sem assinatura**. Isso permite testar Excel e interface antes de configurar a conta Azure, mas não resolve o aviso de publicador desconhecido.

O build usa `electron-builder.config.cjs` com Azure Trusted Signing do electron-builder e timestamp Microsoft. A autenticação OIDC do `azure/login` disponibiliza a sessão Azure CLI ao DefaultAzureCredential da ferramenta de assinatura. Não depende de arquivos PFX no repositório.
