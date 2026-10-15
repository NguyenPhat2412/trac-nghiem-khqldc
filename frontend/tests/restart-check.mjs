import {readFile,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const base=process.env.TEST_URL||'http://localhost:8081';const s=JSON.parse(await readFile('../work/restart-state.json','utf8'));
const response=await fetch(base+'/api/rooms/'+s.roomId,{headers:{Cookie:s.player.cookie}});assert.equal(response.status,200);const room=await response.json();assert.equal(room.status,'REVEAL');assert.equal(room.myAnswer,0);assert.equal(room.members.length,100);assert.equal(room.version,s.version);assert.equal(room.ranking.length,100);
await writeFile('../work/restart-results.json',JSON.stringify({passed:true,roomId:s.roomId,members:100,answersPreserved:true,sessionsPreserved:true}));console.log('PASS restart restores room, answer, ranking and guest session');
