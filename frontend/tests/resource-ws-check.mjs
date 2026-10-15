// Real STOMP protocol/security/load checks against the disposable test service.
import WebSocket from 'ws';
import {writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.TEST_URL||'http://localhost:8081';
async function session(body,path='/session'){
 const res=await fetch(base+'/api'+path,{method:'POST',headers:{'Content-Type':'application/json','Origin':'http://localhost:3000'},body:JSON.stringify(body)});
 assert.equal(res.status,200,await res.clone().text());const actor=await res.json();return {actor,cookie:res.headers.get('set-cookie').split(';')[0]};
}
async function call(client,path,body,method=body===undefined?'GET':'POST'){
 const res=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',Cookie:client.cookie,'X-CSRF-Token':client.actor.csrf,Origin:'http://localhost:3000'},body:body===undefined?undefined:JSON.stringify(body)});
 assert.equal(res.status,200,await res.clone().text());return res.json();
}
function connect(client,csrf=client.actor.csrf){return new Promise((resolve,reject)=>{
 const socket=new WebSocket(base.replace('http','ws')+'/ws',{headers:{Cookie:client.cookie,Origin:'http://localhost:3000'}});const frames=[];const timeout=setTimeout(()=>reject(new Error('STOMP connect timeout')),10000);
 socket.on('open',()=>socket.send(`CONNECT\naccept-version:1.2\nhost:localhost\nX-CSRF-Token:${csrf}\nheart-beat:0,0\n\n\0`));
 socket.on('message',raw=>{const frame=raw.toString();frames.push(frame);if(frame.startsWith('CONNECTED')){clearTimeout(timeout);resolve({socket,frames});}if(frame.startsWith('ERROR')){clearTimeout(timeout);reject(new Error('STOMP rejected'));}});socket.on('error',reject);socket.on('close',()=>{clearTimeout(timeout);reject(new Error('Socket closed'));});
});}
const delay=ms=>new Promise(r=>setTimeout(r,ms));


const env=Object.fromEntries((await readFile('../.env','utf8')).split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]));
const admin=await session({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD},'/auth/login');const catalog=await call(admin,'/catalog');const room=await call(admin,'/admin/rooms',{quizId:catalog.quizzes[0].id});
const p=await session({name:'Bounded resource validation'});await call(p,`/rooms/${room.id}/join`,{});
const sockets=[];for(let i=0;i<4;i++)sockets.push(await connect(p));
await assert.rejects(()=>connect(p));console.log('PASS fifth socket denied for same actor');
sockets.pop().socket.close();await delay(300);sockets.push(await connect(p));console.log('PASS socket slot released after transport close');
const connected=sockets[0];connected.socket.send(`SUBSCRIBE\nid:original\ndestination:/topic/rooms/${room.id}\n\n\0`);await delay(200);
connected.socket.send('UNSUBSCRIBE\nid:original\n\n\0');
for(let i=0;i<20;i++) {
 connected.socket.send(`SUBSCRIBE\nid:cycle${i}\ndestination:/topic/rooms/${room.id}\n\n\0`);
 connected.socket.send(`UNSUBSCRIBE\nid:cycle${i}\n\n\0`);
}

connected.socket.send(`SUBSCRIBE\nid:replacement\ndestination:/topic/rooms/${room.id}\n\n\0`);await delay(200);
await call(admin,`/admin/rooms/${room.id}/start`,{});await delay(300);
assert.equal(connected.frames.filter(x=>x.startsWith('MESSAGE')).length,1);console.log('PASS unsubscribe/re-subscribe retains exactly one notification');
connected.socket.send(`SUBSCRIBE\nid:duplicate\ndestination:/topic/rooms/${room.id}\n\n\0`);await delay(300);
assert(connected.socket.readyState === WebSocket.CLOSED || connected.frames.some(x=>x.startsWith('ERROR')));console.log('PASS duplicate destination rejected');
for(const s of sockets)s.socket.close();await delay(300);
const fresh=await connect(p);fresh.socket.close();console.log('PASS reconnect succeeds after rejected socket cleanup');
await assert.rejects(()=>connect({actor:p.actor,cookie:''}));console.log('PASS anonymous socket rejected');
await call(admin,`/admin/rooms/${room.id}/finish`,{});await call(admin,'/auth/logout',{});
await writeFile('../work/resource-ws-results.json',JSON.stringify({passed:6,duplicateAmplificationBlocked:true,actorSocketLimit:4,reconnectVerified:true},null,2));process.exit(0);
