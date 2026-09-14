import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const collect=vm.runInNewContext(readFileSync(new URL('./collect-result.js',import.meta.url),'utf8'));
const snap=(status,text,cursor='c1')=>({polls:[{cursor,thread:{id:'t',status:{type:status==='completed'?'idle':'active'}},latestTurn:{id:'turn',status},latestAssistantMessage:text?{text}:null}]});
test('timeouts continue inside code with cursor and no extra read',async()=>{
  const received=[];let n=0;
  const result=await collect({threadId:'t',waitThreads:async args=>{received.push(args);return ++n<3?snap('inProgress',null,'c'+n):snap('completed','状态：DONE\n验证：通过','c3');},readThread:()=>assert.fail('unneeded read')});
  assert.equal(result.status,'DONE');assert.equal(result.metrics.waitCalls,3);assert.equal(received[1].targets[0].afterCursor,'c1');assert.equal(received[2].targets[0].afterCursor,'c2');
});
test('missing terminal message permits exactly one bounded read',async()=>{
  let reads=0;const result=await collect({threadId:'t',waitThreads:async()=>snap('completed'),readThread:async args=>{reads++;assert.equal(args.turnLimit,1);return {turns:[{id:'turn',items:[{type:'agentMessage',text:'DONE\n证据：id'}]}]};}});
  assert.equal(result.status,'DONE');assert.equal(reads,1);
});
test('failed task and absent evidence cannot become DONE',async()=>{
  for(const state of [snap('failed'),snap('completed','收到')]){
    const result=await collect({threadId:'t',waitThreads:async()=>state});assert.equal(result.status,'BLOCKED');
  }
});
test('user intervention stops collection without sending messages',async()=>{
  const result=await collect({threadId:'t',waitThreads:async()=>({wake:{reason:'newUserInput'}})});
  assert.equal(result.status,'NEED_USER');assert.equal(result.metrics.sendCalls,0);
});
test('MCP envelope works and missing terminal details stop after one read',async()=>{
  const result=await collect({threadId:'t',waitThreads:async()=>({content:[{type:'text',text:JSON.stringify(snap('completed'))}]}),readThread:async()=>({turns:[]})});
  assert.equal(result.reason,'terminal_result_missing');assert.equal(result.metrics.readCalls,1);
});
