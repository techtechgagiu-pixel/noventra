const encoder=new TextEncoder();
const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
const key=(secret:string)=>crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
const message=async(path:string,body:string,time:string,nonce:string)=>encoder.encode(`POST\n${path}\n${time}\n${nonce}\n${hex(await crypto.subtle.digest('SHA-256',encoder.encode(body)))}`);

export async function signInternal(secret:string,path:string,body:string,time:string,nonce:string){
  if(secret.length<32)throw new Error('Internal service secret is not configured');
  return hex(await crypto.subtle.sign('HMAC',await key(secret),await message(path,body,time,nonce)));
}
export async function verifyInternal(secret:string,path:string,body:string,headers:Headers,now=Date.now()){
  const time=headers.get('x-p11-time')??'',nonce=headers.get('x-p11-nonce')??'',signature=headers.get('x-p11-signature')??'';
  if(secret.length<32||!/^\d{13}$/.test(time)||Math.abs(now-Number(time))>60_000||!/^[a-f0-9-]{36}$/.test(nonce)||!/^[a-f0-9]{64}$/.test(signature))return null;
  const bytes=Uint8Array.from(signature.match(/../g)!,part=>parseInt(part,16));
  return await crypto.subtle.verify('HMAC',await key(secret),bytes,await message(path,body,time,nonce))?nonce:null;
}
