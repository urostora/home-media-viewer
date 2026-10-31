import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';
const source = readFileSync(new URL('../../home-media-viewer/runBackgroundScheduler.mjs', import.meta.url), 'utf8');
const checks = [];
const encoder = new TextEncoder();
const partial = { data: { outcome: 'partial', reason: 'deadline', stages: { metadata: { deferred: 5 } } } };
const success = { data: { outcome: 'success', reason: 'drained', stages: { metadata: { deferred: 0 } } } };
async function scenario({ env={}, replies=[success], expectedWaits=[180], shutdownDuring, signal='SIGTERM' }={}) {
  const signals={}, logs=[], waits=[], timeouts=[];
  let calls=0, active=0;
  const fakeSignal={ any:AbortSignal.any.bind(AbortSignal), timeout:ms=>{
    timeouts.push(ms); const controller=new AbortController(); fakeSignal.last=controller; return controller.signal;
  }};
  const context=createContext({
    URL, AbortController, AbortSignal:fakeSignal, Number, Error, Object, Promise, JSON, TextDecoder,
    process:{env:{PROCESS_TOKEN:'secret-fixture-token',BACKGROUND_URL:'http://background:3000',...env},once:(name,fn)=>{signals[name]=fn;}},
    console:{log:(...args)=>logs.push(args.join(' ')),error:(...args)=>logs.push(args.join(' '))},
    fetch:async(url,options)=>{
      assert.equal(url.hostname,'background'); assert.equal(url.search,'');
      assert.equal(options.headers.Authorization,'Bearer secret-fixture-token');
      assert.equal(active,0,'Requests overlapped'); active++;
      const reply=replies[calls++];
      if(shutdownDuring==='fetch') { signals[signal](); active--; return new Promise(()=>{}); }
      if(reply instanceof Error) {active--; if(calls===replies.length) signals[signal](); throw reply;}
      const response={status:reply.status??200,ok:(reply.status??200)===200,body:{
        cancel:async()=>{active--;},
        getReader:()=>{let read=false; return {
          read:async()=>{
            if(shutdownDuring==='body') {signals[signal](); return new Promise(()=>{});}
            if(reply.timeoutBody) {fakeSignal.last.abort(); return new Promise(()=>{});}
            if(read) {active--; if(calls===replies.length) signals[signal](); return {done:true};}
            read=true; return {done:false,value:encoder.encode(reply.large?'x'.repeat(65537):reply.invalid?'not json':JSON.stringify(reply))};
          },cancel:async()=>{},releaseLock:()=>{},
        };},
      }};
      if(response.status!==200 && calls===replies.length) {
        // Let the response path finish before stopping on the next wait.
        response.body.cancel=async()=>{active--;};
      }
      return response;
    },
  });
  const module=new SourceTextModule(source,{context});
  await module.link(()=>new SyntheticModule(['setTimeout'],function(){this.setExport('setTimeout',async(ms,_,options)=>{
    waits.push(ms/1000); assert.equal(options.signal.aborted,false);
    if(shutdownDuring==='wait' || calls>=replies.length) {signals[signal](); throw new Error('abort');}
    // An invalid/large body never reaches EOF; its request is cancelled before retry.
    if(active) active=0;
  });},{context}));
  await module.evaluate();
  assert.deepEqual(waits,expectedWaits);
  assert(logs.every(line=>!line.includes('secret-fixture-token') && !line.includes('background:3000')));
  return {calls,logs,timeouts};
}
async function check(name,test){await test(); checks.push(name);}
await check('idle/catchup cadence and drained deadline distinction',async()=>{
  const result=await scenario({replies:[partial,success],expectedWaits:[180,30]});
  assert.equal(result.calls,2); assert(result.timeouts.every(ms=>ms===240000));
  await scenario({replies:[{data:{outcome:'partial',reason:'retry_required',stages:{metadata:{deferred:1}}}},success],expectedWaits:[180,180]});
  await scenario({replies:[{data:{outcome:'success',reason:'drained',stages:{metadata:{deferred:0}},durationMs:250000}},success],expectedWaits:[180,180]});
});
await check('capped backoff, 409 cadence, and recovery resets',async()=>{
  await scenario({replies:[{status:503},{status:500},{status:503},{status:503},{status:503},{status:409},partial,success],expectedWaits:[180,180,360,720,900,900,180,30]});
});
await check('custom settings and serial completion-relative timers',async()=>{
  const fractional=await scenario({env:{LONG_PROCESS_TIMEOUT_SEC:'1.5'}}); assert.equal(fractional.timeouts[0],121500);
  const configured=await scenario({env:{BACKGROUND_INTERVAL_SEC:'60',BACKGROUND_CATCHUP_INTERVAL_SEC:'5',BACKGROUND_MAX_BACKOFF_SEC:'120',LONG_PROCESS_TIMEOUT_SEC:'600'},replies:[{status:500},{status:500},{status:500},partial,success],expectedWaits:[60,60,120,120,5]});
  assert(configured.timeouts.every(ms=>ms===720000));
});
await check('shutdown interrupts waiting, fetch and body for both signals',async()=>{
  for(const signal of ['SIGTERM','SIGINT']) for(const shutdownDuring of ['wait','fetch','body']) {
    const result=await scenario({shutdownDuring,signal,expectedWaits:[180]});
    assert.equal(result.calls,shutdownDuring==='wait'?0:1);
  }
});
await check('body timeout, malformed/oversized replies and secret errors back off',async()=>{
  for(const reply of [{timeoutBody:true},{invalid:true},{large:true},new Error('secret-fixture-token http://background:3000')]) {
    const result=await scenario({replies:[reply,success],expectedWaits:[180,180]});
    if(reply.timeoutBody)assert(result.logs.some(line=>line.includes('request_timeout')));
  }
});
await check('strict configuration fails without leaking input',async()=>{
  for(const env of [
    {PROCESS_TOKEN:''},{LONG_PROCESS_TIMEOUT_SEC:'invalid'},{LONG_PROCESS_TIMEOUT_SEC:'601'},
    {BACKGROUND_INTERVAL_SEC:'0'},{BACKGROUND_INTERVAL_SEC:'1.5'},
    {BACKGROUND_CATCHUP_INTERVAL_SEC:'181'},{BACKGROUND_MAX_BACKOFF_SEC:'179'},
    {BACKGROUND_URL:'http://secret-fixture-token@background:3000'},
  ]) await assert.rejects(scenario({env}));
});
console.log(JSON.stringify({checks}));
