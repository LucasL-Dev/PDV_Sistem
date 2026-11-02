export function registerLicenseHandlers({handle,trusted,license,ready=Promise.resolve()}) {
  for(const [channel,method] of [['license:status','status'],['license:login','login'],['license:cancel','cancelLogin'],['license:check','check'],['license:logout','logout']])
    handle(channel,async(event)=>{
      trusted(event);
      if(!['status','cancelLogin'].includes(method))await ready;
      return license[method]();
    });
}
