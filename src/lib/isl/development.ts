export function experimentalRecognitionMode(development:boolean, hostname:string, activated:boolean) {
  const local=['localhost','127.0.0.1','::1','[::1]'].includes(hostname.toLowerCase());
  const available=development && local;
  return {available,active:available && activated,reason:!development?'Production recognition is disabled.':
    !local?'Experimental recognition requires localhost or a loopback address.':
    !activated?'Enable experimental recognition explicitly to start local inference.':
    'Experimental local recognition active. Model validation remains pending.'};
}
