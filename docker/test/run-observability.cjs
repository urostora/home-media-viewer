// Scoped run journals and real pipeline outcomes in disposable DB/storage.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {spawn,spawnSync}=require('node:child_process');
const {createRequire}=require('node:module');
const app=createRequire('/home/node/app/package.json');
app('ts-node').register({transpileOnly:true,project:'/home/node/app/tsconfig.json'}); app('tsconfig-paths/register');
const load=name=>app(`./src/utils/${name}`);
const prisma=load('prisma/prismaImporter').default;
const runner=load('processes/updateMetadataProcess').default;
const {ProcessingFailedError}=load('processes/updateMetadataProcess');
const journal=load('processes/runJournal');
const {withProcessingLock}=load('processes/processingLock');
const {readIndexingState,IndexingBusyError}=load('processes/indexingState');
const factory=load('fileProcessor/processorFactory');
const {MetadataCollector}=load('fileProcessor/metadata');
const stages=load('processes/fileStages');
const checks=[],measurements=[];
const originalLog=console.log,originalError=console.error;
const logs=[]; console.log=(...args)=>logs.push(args.join(' '));console.error=(...args)=>logs.push(args.join(' '));
const check=async(name,test)=>{await test();checks.push(name);};
const boot=`const app=require('node:module').createRequire('/home/node/app/package.json'); app('ts-node').register({transpileOnly:true,project:'/home/node/app/tsconfig.json'}); app('tsconfig-paths/register');`;
const childRead=id=>{
  const result=spawnSync(process.execPath,['-e',boot+`app('./src/utils/processes/runJournal').readProcessingRun(${JSON.stringify(id)}).then(x=>console.log(JSON.stringify(x)));`],{env:process.env,encoding:'utf8',timeout:15000});
  assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout.trim().split('\n').at(-1));
};
async function main(){
 assert.equal(new URL(process.env.DATABASE_URL).pathname,'/benchmark');
 const storage=process.env.APP_STORAGE_PATH;
 await check('authenticated HTTP status reads persistent run details from another server process',async()=>{
  const response=await fetch('http://background:3000/api/process/lastProcessStatistics',{headers:{Authorization:`Bearer ${process.env.PROCESS_TOKEN}`}});
  assert.equal(response.status,200); const body=await response.json();assert(body.run?.id);assert.equal(body.data.runId,body.run.id);
  const selected=await fetch(`http://background:3000/api/process/lastProcessStatistics?runId=${body.run.id}`,{headers:{Authorization:`Bearer ${process.env.PROCESS_TOKEN}`}});
  assert.equal(selected.status,200);assert.equal((await selected.json()).run.id,body.run.id);
  const invalid=await fetch('http://background:3000/api/process/lastProcessStatistics?runId=../bad',{headers:{Authorization:`Bearer ${process.env.PROCESS_TOKEN}`}});assert.equal(invalid.status,400);
  assert.equal((await fetch('http://background:3000/api/process/lastProcessStatistics')).status,403);
 });
 const temporary=await fs.mkdtemp('/tmp/hmv-observability-');
 process.env.APP_STORAGE_PATH=path.join(temporary,'storage');
 const ids=[]; let album; const originalMetadata=factory.getMetadataExtractor,originalThumbnails=factory.getThumbnailGenerator;
 const processStage=stages.processFileStage;
 let failThumbnail=false;
 factory.getMetadataExtractor=()=>async()=>{const result=new MetadataCollector();result.addString('fixture-key','safe');return result;};
 factory.getThumbnailGenerator=()=>async(_file,outputs)=>{
  if(failThumbnail)throw new Error('personal-source-path and private-token must not appear');
  for(const output of outputs.values())await fs.writeFile(output,'fixture-preview');
 };
 let hook;
 prisma.$use(async(params,next)=>hook?hook(params,next):next(params));
 try{
  const source=path.join(temporary,'source.txt');await fs.writeFile(source,'fixture');
  album=await prisma.album.create({data:{name:'run-observability',sourceType:'File',connectionString:'',basePath:temporary}});
  for(let index=0;index<6;index++){
   const row=await prisma.file.create({data:{path:path.relative('/fixtures',source),name:`journal-${index}`,extension:'txt',albums:{connect:{id:album.id}}}});ids.push(row.id);
  }
  const options={albumId:album.id,stages:['metadata','thumbnails'],mode:'refresh',workers:2,timeoutSec:120};
  await check('durable scoped success has independent counts, durations and backlog snapshots after restart',async()=>{
   const result=await runner.run(options);const run=childRead(result.runId);
   assert.equal(run.scope.kind,'album');assert.equal(run.scope.id,album.id);assert.equal(run.mode,'refresh');
   assert.equal(run.outcome,'success');assert.equal(run.reason,'drained');
   for(const value of Object.values(run.stages)){
    assert.equal(value.counts.attempted,6);assert.equal(value.counts.succeeded,6);assert.equal(value.counts.failed,0);
    assert.equal(value.inFlight,0);assert.equal(value.unresolved,0);assert.equal(value.remaining,0);
    assert.equal(value.selectedBefore,6);assert.equal(value.pendingBefore,6);assert.equal(value.pendingAfter,0);
    assert(value.durationMs>=0 && value.processingMs>=0);
   }
   assert.equal(run.statistics.runId,result.runId);assert.equal((await readIndexingState()).runId,result.runId);
  });
  await check('thumbnail failures leave successful metadata and persist independent failed outcomes',async()=>{
   failThumbnail=true;
   try{await assert.rejects(runner.run(options),ProcessingFailedError);}finally{failThumbnail=false;}
   const run=await journal.readProcessingRun();assert.equal(run.outcome,'failed');assert.equal(run.reason,'stage_failure');
   assert.equal(run.stages.metadata.counts.succeeded,6);assert.equal(run.stages.metadata.reason,'drained');
   assert.equal(run.stages.thumbnails.counts.failed,6);assert.equal(run.stages.thumbnails.reason,'stage_failure');
   assert.equal((await prisma.file.findUniqueOrThrow({where:{id:ids[0]}})).metadataStatus,'Processed');
  });
  await check('nested concurrent runner is rejected without replacing a live journal',async()=>{
   let enter,release;const entered=new Promise(resolve=>{enter=resolve;});const gate=new Promise(resolve=>{release=resolve;});
   stages.processFileStage=async(file,stage)=>{enter();await gate;return processStage(file,stage);};
   try{
    await withProcessingLock(async()=>{
     const first=runner.run({fileId:ids[0],stages:['metadata'],mode:'refresh'});
     await entered;
     try{
      const before=await journal.readProcessingRun();assert.equal(before.outcome,'running');
      await assert.rejects(runner.run({fileId:ids[1],stages:['metadata']}),IndexingBusyError);
      const after=await journal.readProcessingRun();assert.equal(after.id,before.id);assert.equal(after.outcome,'running');
     }finally{release();await first;}
    });
   }finally{release();stages.processFileStage=processStage;}
  });
  await check('a failed progress write stops dispatch and preserves confirmed stage results',async()=>{
   const rename=fs.rename;let failed=false;
   fs.rename=async(from,to)=>{
    if(!failed && to.includes('/operations/runs/') && to.endsWith('.json') && !to.endsWith('latest.json')){
     const value=JSON.parse(await fs.readFile(from,'utf8'));
     if(value.outcome==='running' && value.stages.metadata?.counts.succeeded===1){failed=true;throw new Error('fixture journal failure');}
    }
    return rename(from,to);
   };
   try{await assert.rejects(runner.run({...options,workers:1}));}finally{fs.rename=rename;}
   assert(failed);const run=await journal.readProcessingRun();assert.equal(run.outcome,'failed');assert.equal(run.reason,'infrastructure');
   assert.equal(run.stages.metadata.counts.succeeded,1);assert.equal(run.stages.thumbnails.counts.attempted,0);
   assert.equal(run.stages.metadata.remaining,null);assert.equal((await readIndexingState()).outcome,'failed');
  });
  await check('deadline with backlog is partial and does not advance last-success time',async()=>{
   await runner.run(options);const success=(await readIndexingState()).lastSuccessAt;
   const realNow=Date.now;let clock=realNow();Date.now=()=>clock;
   stages.processFileStage=async(file,stage)=>{const result=await processStage(file,stage);if(stage==='metadata')clock+=1500;return result;};
   try{
    const result=await runner.run({...options,timeoutSec:1,workers:1});
    assert.equal(result.outcome,'partial');assert.equal(result.reason,'deadline');
    const run=await journal.readProcessingRun();assert(run.stages.metadata.remaining>0);assert.equal(run.stages.metadata.counts.attempted,1);
    assert.equal(run.stages.thumbnails.counts.attempted,1);assert.equal((await readIndexingState()).outcome,'partial');
    assert.equal((await readIndexingState()).lastSuccessAt,success);
   }finally{Date.now=realNow;stages.processFileStage=processStage;}
  });
  await check('deadline reached while draining final file still reports drained success',async()=>{
   const realNow=Date.now;let clock=realNow();Date.now=()=>clock;
   stages.processFileStage=async(file,stage)=>{const result=await processStage(file,stage);clock+=1500;return result;};
   try{
    const result=await runner.run({fileId:ids[0],stages:['metadata'],mode:'refresh',timeoutSec:1,workers:1});
    assert.equal(result.outcome,'success');assert.equal(result.reason,'drained');
   }finally{Date.now=realNow;stages.processFileStage=processStage;}
  });
  await check('cooperative shutdown persists interrupted outcome and unfinished later stages',async()=>{
   stages.processFileStage=async(file,stage)=>{const result=await processStage(file,stage);process.env.HMV_SHUTTING_DOWN='1';return result;};
   try{
    const result=await runner.run({...options,workers:1});assert.equal(result.outcome,'interrupted');assert.equal(result.reason,'shutdown');
    const run=await journal.readProcessingRun();assert.equal(run.stages.metadata.counts.succeeded,1);
    assert.equal(run.stages.thumbnails.counts.attempted,0);assert(run.stages.thumbnails.remaining>0);
    assert.equal((await readIndexingState()).outcome,'interrupted');
   }finally{delete process.env.HMV_SHUTTING_DOWN;stages.processFileStage=processStage;}
  });
  await check('page infrastructure failure retains confirmed counts and unknown remaining work',async()=>{
   let pages=0;
   hook=async(params,next)=>{if(params.model==='File'&&params.action==='findMany'&&params.args.take===64&&++pages===1)throw new Error('private-token personal-source-path');return next(params);};
   try{await assert.rejects(runner.run(options));}finally{hook=undefined;}
   const run=await journal.readProcessingRun();assert.equal(run.outcome,'failed');assert.equal(run.reason,'infrastructure');
   assert.equal(run.stages.metadata.counts.attempted,0);assert.equal(run.stages.metadata.remaining,null);
   assert(!JSON.stringify(run).includes('private-token'));
  });
  await check('discovery-only persists progress independently without media execution',async()=>{
   const root=path.join(temporary,'discovery');await fs.mkdir(root);await fs.writeFile(path.join(root,'one.txt'),'one');
   const selected=await prisma.album.create({data:{name:'journal-discovery',sourceType:'File',connectionString:'',basePath:root}});
   try{
    const result=await runner.run({albumId:selected.id,stages:['discovery'],timeoutSec:120});
    const run=await journal.readProcessingRun(result.runId);assert.equal(Object.keys(run.stages).join(),'discovery');
    assert.equal(run.stages.discovery.counts.succeeded,1);assert.equal(run.stages.discovery.remaining,0);
    const rows=await prisma.file.findMany({where:{albums:{some:{id:selected.id}}}});ids.push(...rows.map(row=>row.id));
    assert(rows.every(row=>row.metadataStatus==='New'&&row.thumbnailStatus==='New'));
   }finally{await prisma.album.delete({where:{id:selected.id}});}
  });
  await check('discovery deadline checkpoints survive restart and a later run drains the same scope',async()=>{
   const root=path.join(temporary,'discovery-pending');await fs.mkdir(root);
   for(let index=0;index<65;index++)await fs.writeFile(path.join(root,`entry-${index}.txt`),'one');
   const selected=await prisma.album.create({data:{name:'journal-discovery-pending',sourceType:'File',connectionString:'',basePath:root}});
   const now=Date.now,lstat=fs.lstat;let clock=now();
   try{
    Date.now=()=>clock;fs.lstat=async(...args)=>{const result=await lstat(...args);clock+=1500;return result;};
    let result;
    try{result=await runner.run({albumId:selected.id,stages:['discovery'],timeoutSec:1});}finally{Date.now=now;fs.lstat=lstat;}
    assert.equal(result.outcome,'partial');assert.equal(result.reason,'deadline');
    const partial=childRead(result.runId);assert(partial.stages.discovery.remaining>0);assert.equal(partial.stages.discovery.inFlight,0);
    const resumed=await runner.run({albumId:selected.id,stages:['discovery'],timeoutSec:120});
    assert.equal(resumed.outcome,'success');assert.equal((await journal.readProcessingRun(resumed.runId)).stages.discovery.remaining,0);
    assert.equal(childRead(result.runId).outcome,'partial');
    assert.equal(await prisma.file.count({where:{albums:{some:{id:selected.id}},isDirectory:false,metadataStatus:'New',thumbnailStatus:'New'}}),65);
   }finally{Date.now=now;fs.lstat=lstat;await prisma.album.delete({where:{id:selected.id}});}
  });
  await check('SIGKILL leaves lock closed and counts unresolved until safe subsequent acquisition',async()=>{
   const child=spawn(process.execPath,['-e',boot+`
    const {withProcessingLock}=app('./src/utils/processes/processingLock');
    const {createRunJournal}=app('./src/utils/processes/runJournal');
    const {mediaProgress}=app('./src/utils/processes/runProgress');
    withProcessingLock(async()=>{const j=await createRunJournal({stages:['metadata'],mode:'refresh',fileId:'crash-fixture'},1,120);
      await mediaProgress(j,()=>{}).started('metadata',true);setInterval(()=>{},1000);console.log('READY='+j.record.id);await new Promise(()=>{});});
   `],{env:process.env,stdio:['ignore','pipe','pipe']});
   const exit=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal}))); 
   const id=await new Promise((resolve,reject)=>{let out='';child.stdout.on('data',chunk=>{out+=chunk;const m=out.match(/READY=([a-f0-9-]+)/);if(m)resolve(m[1]);});child.once('error',reject);});
   child.kill('SIGKILL');assert.equal((await exit).signal,'SIGKILL');
   assert.equal(childRead(id).outcome,'running');assert.equal(childRead(id).stages.metadata.inFlight,1);
   await assert.rejects(runner.run(options),IndexingBusyError);
   assert.equal(childRead(id).outcome,'running');
   // The task owns this killed child and private volume: all writers are confirmed stopped.
   await fs.rmdir(path.join(process.env.APP_STORAGE_PATH,'operations','indexing.lock'));
   await runner.run({fileId:ids[0],stages:['metadata'],mode:'refresh'});
   const abandoned=childRead(id);assert.equal(abandoned.outcome,'interrupted');assert.equal(abandoned.reason,'abandoned');
   assert.equal(abandoned.finishedAt,null);assert.equal(abandoned.stages.metadata.counts.succeeded,0);
   assert.equal(abandoned.stages.metadata.unresolved,1);assert.equal(abandoned.stages.metadata.inFlight,0);
  });
  await check('recent history is bounded, readable by ID, and leaves no atomic temporary files',async()=>{
   const began=performance.now();
   const history=path.join(process.env.APP_STORAGE_PATH,'operations','runs');
   const template=await journal.readProcessingRun();
   // Seed older finished records to exercise pruning without hundreds of fake processing jobs.
   for(let index=0;index<105;index++){
    const id=require('node:crypto').randomUUID();await fs.writeFile(path.join(history,id+'.json'),JSON.stringify({...template,id,startedAt:new Date(2000,0,1,0,0,index).toISOString()}));
   }
   await fs.writeFile(path.join(history,'.write-'+require('node:crypto').randomUUID()),'incomplete');
   await runner.run({fileId:ids[0],stages:['metadata'],mode:'refresh'});
   const names=await fs.readdir(history);assert.equal(names.filter(name=>/^[a-f0-9-]{36}\.json$/.test(name)).length,100);
   assert(!names.some(name=>name.startsWith('.write-')));assert(await journal.readProcessingRun());
   measurements.push({scenario:'history-prune-and-file-run',elapsedMs:performance.now()-began});
  });
  assert(logs.every(line=>!line.includes('personal-source-path')&&!line.includes('private-token')));
  originalLog(JSON.stringify({checks,measurements}));
 }finally{
  hook=undefined;factory.getMetadataExtractor=originalMetadata;factory.getThumbnailGenerator=originalThumbnails;stages.processFileStage=processStage;
  delete process.env.HMV_SHUTTING_DOWN;
  ids.push(...(await prisma.file.findMany({where:{path:{startsWith:path.relative('/fixtures',temporary)}}})).map(row=>row.id));
  await prisma.fileMeta.deleteMany({where:{fileId:{in:ids}}});
  await prisma.file.updateMany({where:{id:{in:ids}},data:{parentFileId:null}});
  await prisma.file.deleteMany({where:{id:{in:ids}}});
  if(album)await prisma.album.delete({where:{id:album.id}});
  await prisma.discoveryDirectory.deleteMany({where:{path:{startsWith:temporary}}});
  process.env.APP_STORAGE_PATH=storage;await fs.rm(temporary,{recursive:true,force:true});
  await prisma.$disconnect();console.log=originalLog;console.error=originalError;
 }
}
main().catch(error=>{originalError(error);process.exitCode=1});
