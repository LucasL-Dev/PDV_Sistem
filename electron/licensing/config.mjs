export function licenseConfig({ packaged, env = process.env, production = {} }) {
  const origin = packaged ? production.origin : env.OMNIPDV_LICENSE_ORIGIN || production.origin;
  if (!origin) throw Error('Licenciamento não configurado. Defina a origem HTTPS de produção.');
  const url = new URL(origin);
  if(packaged && (url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || /^127\./.test(url.hostname) || url.hostname === '[::1]'))
    throw Error('Aplicativos empacotados exigem uma API HTTPS pública, sem loopback.');
  const local = !packaged && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  if ((!local && url.protocol !== 'https:') || url.origin !== origin || url.username || url.password)
    throw Error('Origem de licenciamento inválida. HTTP local é permitido somente em desenvolvimento.');
  return { origin, issuer: origin, audience: 'omnipvd-desktop', local };
}
