// Real STOMP protocol/security/load checks against the disposable test service.
import WebSocket from 'ws';
import {writeFile} from 'node:fs/promises';
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
 socket.on('message',raw=>{const frame=raw.toString();frames.push(frame);if(frame.startsWith('CONNECTED')){clearTimeout(timeout);resolve({socket,frames});}if(frame.startsWith('ERROR')){clearTimeout(timeout);reject(new Error('STOMP rejected'));}});socket.on('error',reject);
});}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const admin=await session({username:'admin',password:process.env.ADMIN_PASSWORD},'/auth/login');const catalog=await call(admin,'/catalog');const room=await call(admin,'/admin/rooms',{quizId:catalog.quizzes[0].id});
const players=[];for(let i=0;i<100;i++){const p=await session({name:`WS Load ${i+1}`});await call(p,`/rooms/${room.id}/join`,{});players.push(p);}
const sockets=await Promise.all(players.map(p=>connect(p)));sockets.forEach((s,i)=>s.socket.send(`SUBSCRIBE\nid:p${i}\ndestination:/topic/rooms/${room.id}\nreceipt:sub${i}\n\n\0`));
await delay(300);const start=performance.now();const opened=await call(admin,`/admin/rooms/${room.id}/start`,{});
await Promise.all(sockets.map(s=>new Promise((resolve,reject)=>{const until=Date.now()+10000;const poll=setInterval(()=>{if(s.frames.some(f=>f.startsWith('MESSAGE')&&f.includes('"version":'+opened.version))){clearInterval(poll);resolve();}else if(Date.now()>until){clearInterval(poll);reject(new Error('Broadcast not received'));}},10);})));const broadcastMs=performance.now()-start;
assert(sockets.every(s=>s.frames.some(f=>f.startsWith('MESSAGE'))));console.log('PASS 100 authenticated subscribers receive room event');
const outsider=await session({name:'Outsider'});const denied=await connect(outsider);denied.socket.send(`SUBSCRIBE\nid:outsider\ndestination:/topic/rooms/${room.id}\n\n\0`);await delay(250);assert(denied.frames.some(f=>f.startsWith('ERROR')));console.log('PASS Nonmember subscription denied');
const forged=await connect(players[0]);forged.socket.send('SEND\ndestination:/topic/rooms/'+room.id+'\n\n{"score":100}\0');await delay(250);assert(forged.frames.some(f=>f.startsWith('ERROR')));console.log('PASS Client cannot forge broker events');
await assert.rejects(()=>connect(players[0],'wrong'));console.log('PASS STOMP connect requires CSRF token');
const latencies=await Promise.all(players.map(async(p,i)=>{const start=performance.now();await call(p,`/rooms/${room.id}/answer`,{questionId:opened.question.id,answer:i%4});return performance.now()-start;}));
const final=await call(admin,`/rooms/${room.id}`);assert.equal(final.answered,100);assert.equal(final.status,'REVEAL');assert.equal(final.ranking.length,100);console.log('PASS 100 connected players submit without lost answers');
// Room and credentials intentionally persisted in ignored work/ for the restart check.
const state={admin,player:players[0],roomId:room.id,questionId:opened.question.id,version:final.version};await writeFile('../work/restart-state.json',JSON.stringify(state),{mode:0o600});
for(const s of [...sockets,denied,forged])s.socket.close();
const sorted=latencies.sort((a,b)=>a-b);await writeFile('../work/realtime-results.json',JSON.stringify({connections:100,broadcast_all_ms:Math.round(broadcastMs),answer_p50_ms:Math.round(sorted[49]),answer_p95_ms:Math.round(sorted[94]),answer_max_ms:Math.round(sorted[99]),securityChecks:3,answered:100},null,2));
console.log(JSON.stringify({broadcastMs:Math.round(broadcastMs),p95:Math.round(sorted[94])}));
process.exit(0);
