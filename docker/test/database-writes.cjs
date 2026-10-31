// Real transaction/SQL checks in the disposable benchmark database only.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');
const app = createRequire('/home/node/app/package.json');
const client = app('@prisma/client');
const queries = [];
let recording = false;
app.cache[app.resolve('@prisma/client')].exports = {...client, PrismaClient:class extends client.PrismaClient {
  constructor(options) { super({...options,log:[{emit:'event',level:'query'}]}); this.$on('query',event=>{if(recording) queries.push({sql:event.query,ms:event.duration});}); }
}};
app('ts-node').register({transpileOnly:true,project:'/home/node/app/tsconfig.json'}); app('tsconfig-paths/register');
const load = name=>app(`./src/utils/${name}`);
const prisma = load('prisma/prismaImporter').default;
const { processFileStage } = load('processes/fileStages');
const { withProcessingLock } = load('processes/processingLock');
const { writeDiscoveryBatch } = load('processes/discoveryWrites');
const { MetadataCollector } = load('fileProcessor/metadata');
const factory = load('fileProcessor/processorFactory');
const checks = [], measurements = [];
let hook;
prisma.$use(async(params,next)=>hook ? hook(params,next) : next(params));
const check = async(name,test)=>{await test(); checks.push(name);};
const metas = id=>prisma.fileMeta.findMany({where:{fileId:id},orderBy:{metaKey:'asc'}});
async function main() {
  assert.equal(new URL(process.env.DATABASE_URL).pathname,'/benchmark');
  const temporary=await fs.mkdtemp('/tmp/hmv-db-writes-');
  const ids=[]; let album;
  const original=factory.getMetadataExtractor;
  let revision=1;
  const source=path.join(temporary,'media.txt'); await fs.writeFile(source,'source');
  const extracted=()=>{
    const result=new MetadataCollector();
    for(let i=0;i<320;i++) result.addString(`key-${String(i).padStart(3,'0')}`,`revision ${revision}: quote '\\ "; DROP TABLE File; --`);
    result.addInt('integer',revision); result.addFloat('float',revision+0.25);
    result.addDate('date',new Date('2020-01-02T03:04:05Z')); result.addPosition('location',12.5,-45.25);
    result.addInt('changing-type',revision); result.addString('manual','replace'); result.addString('legacy','replace');
    result.addDate('dateTime',new Date('2022-01-02T03:04:05Z')); result.contentDate=new Date('2022-01-02T03:04:05Z');
    return result;
  };
  factory.getMetadataExtractor=()=>async()=>extracted();
  const stage=async id=>processFileStage(await prisma.file.findUniqueOrThrow({where:{id}}),'metadata');
  try {
    album=await prisma.album.create({data:{name:'i7-write-tests',sourceType:'File',connectionString:'',basePath:temporary}});
    const target=await prisma.file.create({data:{name:'i7-write-target',path:path.relative('/fixtures',source),extension:'txt',
      thumbnailStatus:'Error',thumbnailProcessingError:'preserve thumbnail error',thumbnailProcessedAt:new Date('2000-01-01')}});
    ids.push(target.id);
    await prisma.fileMeta.createMany({data:[
      {fileId:target.id,metaKey:'manual',type:'String',origin:'Manual',stringValue:'manual preserved'},
      {fileId:target.id,metaKey:'legacy',type:'String',origin:'Legacy',stringValue:'legacy preserved'},
      {fileId:target.id,metaKey:'dateTime',type:'DateTime',origin:'Manual',dateValue:new Date('2001-02-03')},
      {fileId:target.id,metaKey:'changing-type',type:'String',origin:'Extracted',stringValue:'old string'},
      {fileId:target.id,metaKey:'removed',type:'String',origin:'Extracted',stringValue:'remove'},
    ]});
    const protectedBefore=JSON.stringify((await metas(target.id)).filter(row=>row.origin!=='Extracted'));
    const thumbBefore=JSON.stringify([target.thumbnailStatus,target.thumbnailProcessingError,target.thumbnailProcessedAt]);
    await check('multi-row metadata writes preserve ownership, IDs, values and clear obsolete typed fields',async()=>{
      const idBefore=(await metas(target.id)).find(row=>row.metaKey==='changing-type').id;
      queries.length=0; recording=true;
      assert.equal(await stage(target.id),'succeeded'); recording=false;
      const statements=queries.filter(row=>/INSERT INTO `FileMeta`/.test(row.sql));
      assert.equal(statements.length,3); assert.ok(queries.length<25,`Unexpected SQL amplification: ${queries.length}`);
      measurements.push({scenario:'325-extracted-values',sqlCount:queries.length,bulkInsertCount:statements.length,sqlMs:queries.reduce((sum,row)=>sum+row.ms,0)});
      const rows=await metas(target.id);
      assert.equal(rows.length,328); assert(!rows.some(row=>row.metaKey==='removed'));
      const typed=rows.find(row=>row.metaKey==='changing-type');
      assert.equal(typed.id,idBefore); assert.equal(typed.type,'Int'); assert.equal(typed.stringValue,null); assert.equal(typed.intValue,1);
      assert.equal(rows.find(row=>row.metaKey==='float').floatValue,1.25);
      assert.equal(rows.find(row=>row.metaKey==='date').dateValue.toISOString(),'2020-01-02T03:04:05.000Z');
      assert.equal(rows.find(row=>row.metaKey==='location').longitude,-45.25);
      assert.equal(rows.find(row=>row.metaKey==='key-000').stringValue,extracted().entries.get('key-000').stringValue);
      assert.equal(JSON.stringify(rows.filter(row=>row.origin!=='Extracted')),protectedBefore);
      const row=await prisma.file.findUniqueOrThrow({where:{id:target.id}});
      assert.equal(row.contentDate.toISOString(),'2001-02-03T00:00:00.000Z');
      assert.equal(JSON.stringify([row.thumbnailStatus,row.thumbnailProcessingError,row.thumbnailProcessedAt]),thumbBefore);
      const stable=JSON.stringify(rows); assert.equal(await stage(target.id),'succeeded'); assert.equal(JSON.stringify(await metas(target.id)),stable);
    });
    await check('failure after all metadata chunks rolls back values and retains last-success timestamps',async()=>{
      revision=2; const before=JSON.stringify(await metas(target.id));
      const rowBefore=await prisma.file.findUniqueOrThrow({where:{id:target.id}});
      let failed=false;
      hook=async(params,next)=>{
        if(!failed && params.model==='File' && params.action==='updateMany' && params.args.data.metadataStatus==='Processed') {
          failed=true; await next(params); throw new Error('fixture transaction failure after writes');
        }
        return next(params);
      };
      try { assert.equal(await stage(target.id),'failed'); } finally { hook=undefined; }
      assert(failed); assert.equal(JSON.stringify(await metas(target.id)),before);
      const row=await prisma.file.findUniqueOrThrow({where:{id:target.id}});
      assert.equal(row.metadataStatus,'Error'); assert.equal(+row.metadataProcessedAt,+rowBefore.metadataProcessedAt);
      assert.equal(row.metadataSourceVersion,rowBefore.metadataSourceVersion); assert.equal(row.thumbnailStatus,'Error');
    });
    await check('source change after a real bulk write rolls back and remains retryable',async()=>{
      const before=JSON.stringify(await metas(target.id)); let changed=false;
      hook=async(params,next)=>{
        const result=await next(params);
        if(!changed && params.action==='executeRaw') {changed=true; await fs.appendFile(source,'changed');}
        return result;
      };
      try { assert.equal(await stage(target.id),'deferred'); } finally { hook=undefined; }
      assert(changed); assert.equal(JSON.stringify(await metas(target.id)),before);
      assert.equal((await prisma.file.findUniqueOrThrow({where:{id:target.id}})).metadataStatus,'New');
      assert.equal(await stage(target.id),'succeeded');
    });
    await check('a rolled-back conflict retries every chunk; ambiguous failures are not retried',async()=>{
      revision=3; let commits=0;
      hook=async(params,next)=>{
        if(params.model==='File' && params.action==='updateMany' && params.args.data.metadataStatus==='Processed') {
          commits++; const result=await next(params);
          if(commits===1) throw Object.assign(new Error('rolled-back conflict'),{code:'P2034'});
          return result;
        }
        return next(params);
      };
      queries.length=0; recording=true;
      try { assert.equal(await stage(target.id),'succeeded'); } finally {hook=undefined; recording=false;}
      assert.equal(commits,2); assert(queries.some(row=>row.sql==='ROLLBACK'));
      assert.equal(queries.filter(row=>/INSERT INTO `FileMeta`/.test(row.sql)).length,6);
      assert.equal((await metas(target.id)).find(row=>row.metaKey==='integer').intValue,3);
      revision=4; commits=0; const before=JSON.stringify(await metas(target.id));
      hook=async(params,next)=>{
        if(params.model==='File' && params.action==='updateMany' && params.args.data.metadataStatus==='Processed') {
          commits++; await next(params); throw Object.assign(new Error('ambiguous failure'),{code:'P1001'});
        }
        return next(params);
      };
      try { assert.equal(await stage(target.id),'failed'); } finally {hook=undefined;}
      assert.equal(commits,1); assert.equal(JSON.stringify(await metas(target.id)),before);
    });
    await check('real raw-SQL deadlock 1213 retries the rolled-back transaction',async()=>{
      const { retryMetadataTransaction }=load('processes/retryMetadataTransaction');
      const other=await prisma.file.create({data:{path:target.path,name:'i7-deadlock-target',extension:'txt'}}); ids.push(other.id);
      let firstReady,secondReady;
      const first=new Promise(resolve=>{firstReady=resolve;}); const second=new Promise(resolve=>{secondReady=resolve;});
      const attempts=[0,0]; const failures=[];
      const work=(index,a,b,signal,wait)=>retryMetadataTransaction(async()=>{
        attempts[index]++;
        try {
          return await prisma.$transaction(async tx=>{
            await tx.$executeRaw`UPDATE File SET size = COALESCE(size,0)+1 WHERE id = ${a}`;
            if(attempts[index]===1) { signal(); await wait; }
            await tx.$executeRaw`UPDATE File SET size = COALESCE(size,0)+1 WHERE id = ${b}`;
          });
        } catch(error) {failures.push({code:error.code,databaseCode:error.meta?.code}); throw error;}
      });
      const before=await prisma.file.findMany({where:{id:{in:[target.id,other.id]}}});
      await Promise.all([work(0,target.id,other.id,firstReady,second),work(1,other.id,target.id,secondReady,first)]);
      assert.equal(attempts[0]+attempts[1],3);
      assert.equal(failures.length,1); assert.equal(failures[0].code,'P2010'); assert.equal(failures[0].databaseCode,'1213');
      for(const row of await prisma.file.findMany({where:{id:{in:[target.id,other.id]}}})) {
        assert.equal(row.size,(before.find(old=>old.id===row.id).size??0)+2);
      }
      let attemptsForOtherError=0;
      await assert.rejects(retryMetadataTransaction(async()=>{attemptsForOtherError++; throw Object.assign(new Error('other raw failure'),{code:'P2010',meta:{code:'1205'}});}));
      assert.equal(attemptsForOtherError,1);
      measurements.push({scenario:'real-raw-deadlock',attempts,failures});
    });
    await check('discovery batch constraint/enqueue failures leave no partial records or memberships',async()=>{
      const created=Array.from({length:8},(_,index)=>({id:`i7-batch-${index}`,name:`batch-${index}`,path:`i7-batch/${index}`,extension:'txt'}));
      ids.push(...created.map(row=>row.id));
      const memberships=created.map(row=>({albumId:album.id,fileId:row.id}));
      const directories=[path.join(temporary,'child')];
      await assert.rejects(writeDiscoveryBatch({created,updated:[],memberships:[...memberships,{albumId:'i7-missing-album',fileId:created[0].id}],directories}));
      assert.equal(await prisma.file.count({where:{id:{in:created.map(row=>row.id)}}}),0);
      hook=async(params,next)=>{if(params.model==='DiscoveryDirectory' && params.action==='createMany') throw new Error('enqueue failure'); return next(params);};
      try { await assert.rejects(writeDiscoveryBatch({created,updated:[],memberships,directories})); } finally {hook=undefined;}
      assert.equal(await prisma.file.count({where:{id:{in:created.map(row=>row.id)}}}),0);
      await writeDiscoveryBatch({created,updated:[],memberships,directories});
      await writeDiscoveryBatch({created:[],updated:[],memberships,directories});
      const rows=await prisma.file.findMany({where:{id:{in:created.map(row=>row.id)}},include:{albums:true}});
      assert.equal(rows.length,8); assert(rows.every(row=>row.albums.length===1 && row.albums[0].id===album.id));
      await prisma.discoveryDirectory.deleteMany({where:{path:{startsWith:temporary}}});
    });
    await check('one locked file cannot block another worker or the pool readiness reserve',async()=>{
      const other=await prisma.file.create({data:{path:target.path,name:'i7-unlocked-target',extension:'txt'}}); ids.push(other.id);
      let release, locked; const lockReady=new Promise(resolve=>{locked=resolve;}); const gate=new Promise(resolve=>{release=resolve;});
      const blocker=prisma.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM File WHERE id = ${target.id} FOR UPDATE`; locked(); await gate;},{timeout:10000});
      await lockReady;
      try {
        await withProcessingLock(async()=>{
          const blocked=stage(target.id);
          try {
            const started=performance.now();
            assert.equal(await stage(other.id),'succeeded');
            await prisma.$queryRaw`SELECT 1`;
            measurements.push({scenario:'unrelated-file-with-row-lock',elapsedMs:performance.now()-started});
          } finally { release(); await blocker; assert.equal(await blocked,'succeeded'); }
        });
      } finally { release(); await blocker; }
      // Four active transactions leave the configured fifth connection for foreground/readiness work.
      const releases=[]; const ready=[];
      const holders=Array.from({length:4},()=>{
        let release, started; const gate=new Promise(resolve=>{release=resolve;}); ready.push(new Promise(resolve=>{started=resolve;})); releases.push(release);
        return prisma.$transaction(async tx=>{await tx.$queryRaw`SELECT 1`; started(); await gate;},{timeout:10000});
      });
      try {await Promise.all(ready); await prisma.$queryRaw`SELECT 1`;} finally {releases.forEach(release=>release()); await Promise.all(holders);}
    });
    console.log(JSON.stringify({checks,measurements,poolLimit:Number(process.env.DB_CONNECTION_LIMIT)}));
  } finally {
    recording=false; hook=undefined; factory.getMetadataExtractor=original;
    await prisma.fileMeta.deleteMany({where:{fileId:{in:ids}}});
    await prisma.file.deleteMany({where:{id:{in:ids}}});
    if(album) await prisma.album.delete({where:{id:album.id}});
    await prisma.discoveryDirectory.deleteMany({where:{path:{startsWith:temporary}}});
    await fs.rm(temporary,{recursive:true,force:true}); await prisma.$disconnect();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1});
