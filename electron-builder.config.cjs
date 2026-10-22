const { build } = require('./package.json');
const enabled = process.env.OMNIPDV_AZURE_SIGNING === 'true';
let azureSignOptions;
if (enabled) {
  const fields = {
    endpoint: 'AZURE_SIGNING_ENDPOINT',
    codeSigningAccountName: 'AZURE_SIGNING_ACCOUNT',
    certificateProfileName: 'AZURE_SIGNING_PROFILE',
    publisherName: 'AZURE_SIGNING_PUBLISHER',
  };
  azureSignOptions = Object.fromEntries(Object.entries(fields).map(([key, env]) => {
    const value = process.env[env]?.trim();
    if (!value) throw Error(`Configure ${env} para assinar o instalador.`);
    return [key, value];
  }));
  const endpoint = new URL(azureSignOptions.endpoint);
  if (endpoint.protocol !== 'https:' || !endpoint.hostname.endsWith('.codesigning.azure.net'))
    throw Error('Use o endpoint HTTPS de Artifact Signing exibido no portal Azure.');
}
module.exports = {
  ...build,
  forceCodeSigning: enabled,
  win: { ...build.win, signExecutable: enabled, ...(enabled ? { azureSignOptions } : {}) },
};
