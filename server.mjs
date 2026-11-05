import http from'node:http';
import{randomBytes,scryptSync,timingSafeEqual,randomUUID}from'node:crypto';
import{readFileSync,writeFileSync,existsSync,mkdirSync,statSync}from'node:fs';
import{dirname,extname,resolve,sep}from'node:path';
import{fileURLToPath}from'node:url';
import{items}from'./data/items.js';

const root=dirname(fileURLToPath(import.meta.url));
function readLocalEnv(){const p=resolve(root,'.env.local');if(!existsSync(p))return;for(const line of readFileSync(p,'utf8').split(/\r?\n/)){const m=line.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2]}}
readLocalEnv();
const adminPassword=process.env.CCL_ADMIN_PASSWORD;
if(!adminPassword||adminPassword.length<16)throw new Error('Set CCL_ADMIN_PASSWORD (16+ chars) in .env.local or server environment before starting.');
const dataDir=resolve(root,'.data'),dbFile=resolve(dataDir,'accounts.json');mkdirSync(dataDir,{recursive:true});
const newState=()=>({balance:1200,xp:0,level:1,inventory:[],history:[],dailyAt:'',opened:0,achievements:[],season:0});
let db=existsSync(dbFile)?JSON.parse(readFileSync(dbFile,'utf8')):{users:[]};
const hashPassword=(password,salt)=>scryptSync(password,salt,64).toString('hex');
let admin=db.users.find(u=>u.username==='admin');
if(!admin){const salt=randomBytes(16).toString('hex');admin={id:randomUUID(),username:'admin',role:'admin',salt,passwordHash:hashPassword(adminPassword,salt),createdAt:new Date().toISOString(),state:newState()};db.users.push(admin)}else{admin.role='admin';if(hashPassword(adminPassword,admin.salt)!==admin.passwordHash)admin.passwordHash=hashPassword(adminPassword,admin.salt)}
function persist(){writeFileSync(dbFile,JSON.stringify(db,null,2),'utf8')};persist();
const sessions=new Map(),loginAttempts=new Map(),sessionMaxAge=1000*60*60*24*7;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.json':'application/json; charset=utf-8'};
function send(res,status,payload,headers={}){const body=Buffer.from(JSON.stringify(payload));res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':body.length,...headers});res.end(body)}
function safeUser(user){return{id:user.id,username:user.username,role:user.role,createdAt:user.createdAt,state:user.state}}
function cookieOpts(){return`Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(sessionMaxAge/1000)}${process.env.NODE_ENV==='production'?'; Secure':''}`}
function setSession(res,user){const token=randomBytes(32).toString('base64url');sessions.set(token,{userId:user.id,expires:Date.now()+sessionMaxAge});res.setHeader('Set-Cookie',`ccl_session=${token}; ${cookieOpts()}`)}
function clearSession(res){res.setHeader('Set-Cookie','ccl_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0')}
function auth(req){const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('ccl_session='))?.slice(12);const s=token&&sessions.get(token);if(!s||s.expires<Date.now()){if(token)sessions.delete(token);return null}return db.users.find(u=>u.id===s.userId)||null}
async function body(req){let data='';for await(const part of req){data+=part;if(data.length>100_000)throw new Error('Request body is too large')}try{return JSON.parse(data||'{}')}catch{throw new Error('Invalid JSON')}}
function originOk(req){const origin=req.headers.origin;if(!origin)return true;try{return new URL(origin).host===req.headers.host}catch{return false}}
function rateLimited(req){const ip=req.socket.remoteAddress||'unknown',now=Date.now(),entry=loginAttempts.get(ip)||{count:0,until:now+600_000};if(entry.until<now){entry.count=0;entry.until=now+600_000}entry.count++;loginAttempts.set(ip,entry);return entry.count>12}
function fail(res,status,message){send(res,status,{error:message})}
async function api(req,res,url){
 if(req.method==='GET'&&url.pathname==='/api/me'){const user=auth(req);return user?send(res,200,safeUser(user)):send(res,200,{user:null})}
 if(req.method==='POST'&&url.pathname==='/api/auth/register'){
  if(!originOk(req))return fail(res,403,'Origin rejected');const b=await body(req),username=String(b.username||'').trim();const password=String(b.password||'');
  if(!/^[\p{L}\p{N}_-]{3,24}$/u.test(username)||username.toLowerCase()==='admin')return fail(res,400,'Имя: 3–24 буквы, цифры, _ или -');
  if(password.length<10||password.length>128)return fail(res,400,'Пароль должен содержать от 10 до 128 символов');
  if(db.users.some(u=>u.username.toLowerCase()===username.toLowerCase()))return fail(res,409,'Это имя уже занято');
  const salt=randomBytes(16).toString('hex'),user={id:randomUUID(),username,role:'player',salt,passwordHash:hashPassword(password,salt),createdAt:new Date().toISOString(),state:newState()};db.users.push(user);persist();setSession(res,user);return send(res,201,safeUser(user));
 }
 if(req.method==='POST'&&url.pathname==='/api/auth/login'){
  if(!originOk(req))return fail(res,403,'Origin rejected');if(rateLimited(req))return fail(res,429,'Слишком много попыток. Повторите позже.');const b=await body(req),username=String(b.username||'').trim().toLowerCase(),password=String(b.password||'');
  const user=db.users.find(u=>u.username.toLowerCase()===username);const candidate=user?hashPassword(password,user.salt):hashPassword(password,'invalid-user-salt');if(!user||!timingSafeEqual(Buffer.from(candidate,'hex'),Buffer.from(user?.passwordHash||candidate,'hex')))return fail(res,401,'Неверное имя или пароль');setSession(res,user);return send(res,200,safeUser(user));
 }
 if(req.method==='POST'&&url.pathname==='/api/auth/logout'){if(!originOk(req))return fail(res,403,'Origin rejected');const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('ccl_session='))?.slice(12);if(token)sessions.delete(token);clearSession(res);return send(res,200,{ok:true})}
 const user=auth(req);
 if(req.method==='POST'&&url.pathname==='/api/state'){
  if(!user)return fail(res,401,'Требуется вход');if(!originOk(req))return fail(res,403,'Origin rejected');const b=await body(req);
  if(!Number.isSafeInteger(b.balance)||b.balance<0||b.balance>1_000_000_000_000_000||!Array.isArray(b.inventory)||b.inventory.length>5000)return fail(res,400,'Некорректное состояние игры');
  const safeKeys=['uid','id','name','rarity','color','icon','value','category','description','art','obtainedAt','source'];user.state={...user.state,...b,inventory:b.inventory.map(x=>Object.fromEntries(safeKeys.filter(k=>x[k]!==undefined).map(k=>[k,x[k]]))),history:Array.isArray(b.history)?b.history.slice(0,2000):user.state.history};persist();return send(res,200,{ok:true});
 }
 if(url.pathname.startsWith('/api/admin/')){
  if(!user||user.role!=='admin')return fail(res,403,'Доступ только администратору');
  if(req.method==='GET'&&url.pathname==='/api/admin/users'){
   const q=(url.searchParams.get('q')||'').trim().toLowerCase();const users=db.users.filter(u=>u.role==='player'&&(!q||u.username.toLowerCase().includes(q))).slice(0,100).map(u=>({id:u.id,username:u.username,balance:u.state.balance,items:u.state.inventory.length,createdAt:u.createdAt}));return send(res,200,{users});
  }
  if(req.method==='POST'&&url.pathname==='/api/admin/grant'){
   if(!originOk(req))return fail(res,403,'Origin rejected');const b=await body(req),target=db.users.find(u=>u.id===b.userId&&u.role==='player');if(!target)return fail(res,404,'Игрок не найден');const tokens=Number(b.tokens||0);if(!Number.isSafeInteger(tokens)||tokens<0||tokens>1_000_000_000_000_000)return fail(res,400,'Введите целое неотрицательное число жетонов');
   let item=null;if(b.itemId){const source=items.find(x=>x.id===String(b.itemId));if(!source)return fail(res,400,'Предмет не найден');item={...source,uid:randomUUID(),obtainedAt:new Date().toISOString(),source:'Награда администратора'};target.state.inventory.unshift(item)}
   if(tokens===0&&!item)return fail(res,400,'Укажите жетоны или предмет');target.state.balance+=tokens;if(!Number.isSafeInteger(target.state.balance))return fail(res,400,'Баланс превысит допустимый предел');persist();return send(res,200,{ok:true,user:{id:target.id,username:target.username,balance:target.state.balance,items:target.state.inventory.length},item});
  }
  return fail(res,404,'Not found');
 }
 return fail(res,user?404:401,user?'Not found':'Требуется вход');
}
const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','same-origin');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
 try{const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);if(url.pathname.startsWith('/api/'))return await api(req,res,url);
   if(req.method!=='GET'&&req.method!=='HEAD')return fail(res,405,'Method not allowed');let pathname=decodeURIComponent(url.pathname);if(pathname==='/')pathname='/index.html';const filename=resolve(root,`.${pathname}`);if(!filename.startsWith(root+sep)||pathname.split('/').some(part=>part.startsWith('.')))return fail(res,404,'Not found');if(!existsSync(filename)||!statSync(filename).isFile())return fail(res,404,'Not found');const content=readFileSync(filename);res.writeHead(200,{'Content-Type':mime[extname(filename).toLowerCase()]||'application/octet-stream','Content-Length':content.length,'Cache-Control':'no-cache'});return req.method==='HEAD'?res.end():res.end(content);
 }catch(e){console.error('request failed:',e.message);if(!res.headersSent)fail(res,500,'Internal server error');else res.end()}
});
const port=Number(process.env.PORT||8000);server.listen(port,'0.0.0.0',()=>console.log(`Case Clash Lab listening on http://localhost:${port}`));
