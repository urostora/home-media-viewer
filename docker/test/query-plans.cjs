// Captures production Prisma page SQL and measures candidate indexes in an isolated MariaDB.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const app = createRequire('/home/node/app/package.json');
const client = app('@prisma/client');
let pageQuery;
app.cache[app.resolve('@prisma/client')].exports={...client,PrismaClient:class extends client.PrismaClient {
  constructor(options) {super({...options,log:[{emit:'event',level:'query'}]}); this.$on('query',event=>{
    if(/SELECT .*`File`\./.test(event.query) && /ORDER BY .*`id` ASC LIMIT/.test(event.query)) pageQuery={sql:event.query,params:JSON.parse(event.params)};
  });}
}};
app('ts-node').register({transpileOnly:true,project:'/home/node/app/tsconfig.json'}); app('tsconfig-paths/register');
const load=name=>app(`./src/utils/${name}`);
const prisma=load('prisma/prismaImporter').default;
const { processMediaQueue }=load('processes/mediaQueue');
const N=32768, prefix='i7-plan-', cursor='i7-plan-cursor';
const id=index=>`${prefix}${String(index).padStart(6,'0')}`;
const albums=['i7-plan-all','i7-plan-overlap','i7-plan-small'];
const candidates=[
  {name:'File_status_isDirectory_metadataStatus_id_idx',columns:'`status`, `isDirectory`, `metadataStatus`, `id`'},
  {name:'File_status_isDirectory_thumbnailStatus_id_idx',columns:'`status`, `isDirectory`, `thumbnailStatus`, `id`'},
];
let capture=false, stop=false;
prisma.$use(async(params,next)=>{
  const result=await next(params);
  if(capture && params.model==='File' && params.action==='findMany' && params.args.take===64) stop=true;
  return result;
});
const rawJSON=async(prefix,query)=>{
  const rows=await prisma.$queryRawUnsafe(`${prefix} ${query.sql}`,...query.params);
  return JSON.parse(Object.values(rows[0])[0]);
};
function tables(value,result=[]) {
  if(value && typeof value==='object') {
    if(value.table_name) result.push({table:value.table_name,key:value.key,access:value.access_type,estimatedRows:value.rows,
      actualRows:value.r_rows,loops:value.r_loops,filtered:value.r_filtered});
    for(const child of Object.values(value)) tables(child,result);
  }
  return result;
}
async function capturePage(stages,mode,scope,after) {
  if(after) await prisma.mediaQueueCursor.upsert({where:{id:cursor},create:{id:cursor,lastFileId:after},update:{lastFileId:after}});
  pageQuery=undefined; stop=false; capture=true;
  try {await processMediaQueue({scope,stages,mode,workers:1,stopped:()=>stop,...(after?{cursorKey:cursor}:{})});}
  finally {capture=false;}
  assert(pageQuery,'Production page SQL not captured');
  return pageQuery;
}
async function measure(scenarios) {
  const results=[];
  for(const scenario of scenarios) {
    const query=await capturePage(scenario.stages,scenario.mode,scenario.scope,scenario.after);
    const explain=await rawJSON('EXPLAIN FORMAT=JSON',query);
    const runs=[];
    for(let iteration=0;iteration<3;iteration++) {
      const result=await rawJSON('ANALYZE FORMAT=JSON',query);
      runs.push({totalMs:result.query_block.r_total_time_ms,tables:tables(result)});
    }
    const ids=(await prisma.$queryRawUnsafe(query.sql,...query.params)).map(row=>row.id);
    results.push({name:scenario.name,query,explain,runs,ids});
  }
  return results;
}
async function main() {
  assert.equal(new URL(process.env.DATABASE_URL).pathname,'/benchmark');
  const beforeIndexes=await prisma.$queryRawUnsafe('SHOW INDEX FROM `File`');
  const original=new Set(beforeIndexes.map(row=>row.Key_name));
  assert(candidates.every(candidate=>original.has(candidate.name)),'Additive queue indexes were not migrated');
  const scope={status:'Active',albums:{some:{id:{in:albums.slice(0,2)}}}};
  const smallScope={status:'Active',albums:{some:{id:albums[2]}}};
  const scenarios=[
    {name:'sparse-metadata-overlap-first',stages:['metadata'],mode:'pending',scope},
    {name:'sparse-metadata-overlap-resume',stages:['metadata'],mode:'pending',scope,after:id(15000)},
    {name:'sparse-thumbnails-overlap-resume',stages:['thumbnails'],mode:'pending',scope,after:id(15000)},
    {name:'sparse-union-overlap-first',stages:['metadata','thumbnails'],mode:'pending',scope},
    {name:'sparse-union-overlap-resume',stages:['metadata','thumbnails'],mode:'pending',scope,after:id(15000)},
    {name:'sparse-metadata-small-album',stages:['metadata'],mode:'pending',scope:smallScope},
    {name:'dense-refresh-overlap',stages:['metadata','thumbnails'],mode:'refresh',scope,after:id(15000)},
  ];
  try {
    await prisma.album.createMany({data:albums.map(albumId=>({id:albumId,name:albumId,sourceType:'File',connectionString:'',basePath:`/unselected/${albumId}`}))});
    for(let offset=0;offset<N;offset+=512) {
      const rows=Array.from({length:Math.min(512,N-offset)},(_,index)=>{
        const i=offset+index;
        return {id:id(i),path:`${prefix}source/${i}`,name:`entry-${i}`,extension:'jpg',
          metadataStatus:i%1024===0?'New':'Processed',thumbnailStatus:i%1280===0?'New':'Processed'};
      });
      await prisma.file.createMany({data:rows});
      const relations=rows.flatMap((row,index)=>[[albums[0],row.id],...((offset+index)%2===0?[[albums[1],row.id]]:[]),...((offset+index)%64===0?[[albums[2],row.id]]:[])]);
      await prisma.$executeRaw(client.Prisma.sql`INSERT INTO \`_AlbumFiles\` (\`A\`,\`B\`) VALUES ${client.Prisma.join(relations.map(([album,file])=>client.Prisma.sql`(${album},${file})`))}`);
    }
    // When validating a migration, temporarily remove only its indexes in this disposable DB
    // to retain an actual before/after comparison on exactly the same records and SQL.
    for(const candidate of candidates) if(original.has(candidate.name)) await prisma.$executeRawUnsafe(`DROP INDEX \`${candidate.name}\` ON \`File\``);
    await prisma.$queryRawUnsafe('ANALYZE TABLE `File`, `_AlbumFiles`');
    const before=await measure(scenarios);
    for(const candidate of candidates) await prisma.$executeRawUnsafe(`CREATE INDEX \`${candidate.name}\` ON \`File\` (${candidate.columns})`);
    await prisma.$queryRawUnsafe('ANALYZE TABLE `File`, `_AlbumFiles`');
    const after=await measure(scenarios);
    for(let index=0;index<before.length;index++) assert.deepEqual(after[index].ids,before[index].ids);
    const fileVisits=row=>row.runs[0].tables.filter(table=>table.table==='File').reduce((sum,table)=>sum+(table.actualRows??0)*(table.loops??0),0);
    assert(fileVisits(after[0])*10<fileVisits(before[0]),'Candidate metadata index did not reduce sparse page row visits');
    assert(JSON.stringify(after[0].explain).includes(candidates[0].name));
    assert(JSON.stringify(after[2].explain).includes(candidates[1].name));
    const denseScope=await prisma.file.updateMany({where:{id:{startsWith:prefix}},data:{metadataStatus:'New',thumbnailStatus:'New'}});
    assert.equal(denseScope.count,N);
    const denseAfterStale=await measure([{name:'dense-pending-union-stale-statistics',stages:['metadata','thumbnails'],mode:'pending',scope,after:id(15000)}]);
    await prisma.$queryRawUnsafe('ANALYZE TABLE `File`');
    const dense=await measure([{name:'dense-pending-union-overlap',stages:['metadata','thumbnails'],mode:'pending',scope,after:id(15000)}]);
    for(const candidate of candidates) await prisma.$executeRawUnsafe(`DROP INDEX \`${candidate.name}\` ON \`File\``);
    await prisma.$queryRawUnsafe('ANALYZE TABLE `File`');
    const denseBefore=await measure([{name:'dense-pending-union-overlap',stages:['metadata','thumbnails'],mode:'pending',scope,after:id(15000)}]);
    assert.deepEqual(dense[0].ids,denseBefore[0].ids);
    let firstReady, secondReady;
    const first=new Promise(resolve=>{firstReady=resolve;}); const second=new Promise(resolve=>{secondReady=resolve;});
    const contention=await Promise.allSettled([
      prisma.$transaction(async tx=>{
        await tx.$executeRaw`UPDATE File SET size = 1 WHERE id = ${id(0)}`; firstReady(); await second;
        await tx.$executeRaw`UPDATE File SET size = 1 WHERE id = ${id(1)}`;
      }),
      prisma.$transaction(async tx=>{
        await tx.$executeRaw`UPDATE File SET size = 2 WHERE id = ${id(1)}`; secondReady(); await first;
        await tx.$executeRaw`UPDATE File SET size = 2 WHERE id = ${id(0)}`;
      }),
    ]);
    const deadlockErrors=contention.filter(result=>result.status==='rejected').map(result=>({code:result.reason.code,databaseCode:result.reason.meta?.code}));
    assert.equal(deadlockErrors.length,1);
    console.log(JSON.stringify({deadlockErrors,rows:N,albumMemberships:N+N/2+N/64,originalIndexes:[...original],candidates,before,after,denseBefore,denseAfter:dense,denseAfterStale,
      checks:['actual production page SQL and bound parameters captured','sparse/dense/overlapping/small album keyset plans measured three times','candidate indexes reduce sparse row visits and preserve ordered page results']}));
  } finally {
    const current=new Set((await prisma.$queryRawUnsafe('SHOW INDEX FROM `File`')).map(row=>row.Key_name));
    for(const candidate of candidates) {
      if(original.has(candidate.name) && !current.has(candidate.name)) await prisma.$executeRawUnsafe(`CREATE INDEX \`${candidate.name}\` ON \`File\` (${candidate.columns})`);
      if(!original.has(candidate.name) && current.has(candidate.name)) await prisma.$executeRawUnsafe(`DROP INDEX \`${candidate.name}\` ON \`File\``);
    }
    await prisma.file.deleteMany({where:{id:{startsWith:prefix}}});
    await prisma.album.deleteMany({where:{id:{in:albums}}});
    await prisma.mediaQueueCursor.deleteMany({where:{id:cursor}});
    await prisma.$disconnect();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1});
