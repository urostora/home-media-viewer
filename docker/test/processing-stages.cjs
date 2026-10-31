// Runs only in scripts/benchmark/run.py --validate-stages' disposable database/storage.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const app = '/home/node/app';
const requireApp = createRequire(`${app}/package.json`);
requireApp('ts-node').register({transpileOnly:true, project:`${app}/tsconfig.json`});
requireApp('tsconfig-paths/register');
const load = name => requireApp(`./src/${name}`);
const prisma = load('utils/prisma/prismaImporter.ts').default;
const runner = load('utils/processes/updateMetadataProcess.ts').default;
const { ProcessingFailedError } = load('utils/processes/updateMetadataProcess.ts');
const { withProcessingLock } = load('utils/processes/processingLock.ts');
const { IndexingBusyError, readIndexingState } = load('utils/processes/indexingState.ts');
const { processFileStage } = load('utils/processes/fileStages.ts');
const { sourceVersion } = load('utils/processes/sourceIdentity.ts');
const { getFileThumbnailPath } = load('utils/thumbnailHelper.ts');
const { thumbnailSizes } = load('utils/frontend/thumbnailUtils.ts');
const { parseProcessingCli } = load('utils/processes/processingCli.ts');
const { validateProcessingOptions } = load('types/processingTypes.ts');
const factory = load('utils/fileProcessor/processorFactory.ts');
const commands = load('utils/mediaCommand.ts');
const checks = [];
const stageSmoke = [];
let cookie = '';
const originalLog = console.log;
console.log = () => {};
console.error = () => {};
async function check(name, test) { await test(); checks.push(name); originalLog(JSON.stringify({check:name,passed:true})); }
async function file(id) { return prisma.file.findUniqueOrThrow({where:{id}}); }
async function metadataSnapshot(id) {
  const row = await file(id);
  for (const key of ['thumbnailStatus','thumbnailProcessedAt','thumbnailProcessingError','thumbnailSourceVersion']) delete row[key];
  return JSON.stringify({row, metas:await prisma.fileMeta.findMany({where:{fileId:id}, orderBy:{metaKey:'asc'}})});
}
async function thumbnailsSnapshot(id) {
  const row = await file(id);
  const hashes = [];
  for (const size of thumbnailSizes) {
    try { hashes.push(createHash('sha256').update(await fs.readFile(getFileThumbnailPath(row,size))).digest('hex')); }
    catch (e) { if (e.code !== 'ENOENT') throw e; hashes.push(null); }
  }
  return JSON.stringify({status:row.thumbnailStatus, date:row.thumbnailProcessedAt, error:row.thumbnailProcessingError,
    version:row.thumbnailSourceVersion, hashes});
}
async function request(route, data, method='POST', session=cookie) {
  const response = await fetch(`http://app:3000${route}`, {method, headers:{'content-type':'application/json', cookie:session},
    body:data === undefined ? undefined : JSON.stringify(data), signal:AbortSignal.timeout(120000)});
  let result;
  try { result = await response.json(); } catch {}
  return {response,result};
}
async function refresh(id, stages) { return runner.run({fileId:id, stages, mode:'refresh', timeoutSec:120}); }
async function main() {
  assert.equal(new URL(process.env.DATABASE_URL).pathname,'/benchmark');
  assert.equal(process.env.APP_ALBUM_ROOT_PATH,'/fixtures');
  await check('additive migration preserves historical values, states and dates', async () => {
    const legacy = await file('i3-legacy-file');
    assert.equal(legacy.metadataStatus,'Processed');
    assert.equal(legacy.thumbnailStatus,'Processed');
    assert.equal(legacy.metadataProcessedAt.toISOString(),'2001-01-01T00:00:00.000Z');
    assert.equal(legacy.thumbnailProcessedAt.toISOString(),'2001-01-02T00:00:00.000Z');
    assert.equal(legacy.sourceVersion,null);
    const meta = await prisma.fileMeta.findFirstOrThrow({where:{fileId:legacy.id}});
    assert.equal(meta.origin,'Legacy'); assert.equal(meta.stringValue,'keep historical value');
    const queued = await prisma.discoveryDirectory.findUniqueOrThrow({where:{id:'i4-existing-task'}});
    assert.equal(queued.entryCursor,'keep-entry'); assert.equal(queued.cleanupCursor,'keep-id');
    assert.equal(queued.lastServedAt.toISOString(),'2001-01-01T00:00:00.000Z');
    assert.equal(queued.scanVersion,null);
    assert.equal(await prisma.mediaQueueCursor.count(),0);
  });
  await check('strict stage/scope/mode and CLI validation', async () => {
    for (const invalid of [null,[],{stages:null},{mode:null},{stages:[]},{stages:['unknown']},{stages:['metadata','metadata']},
      {mode:'erase'},{fileId:'x',albumId:'y'},{fileId:'x',stages:['discovery']},{fileId:42},
      {workers:0},{workers:1.5},{timeoutSec:Infinity},{typo:true}]) assert.throws(()=>validateProcessingOptions(invalid));
    assert.deepEqual(parseProcessingCli(['--stages','thumbnails','--file','x','--mode','refresh']).stages,['thumbnails']);
    assert.throws(()=>parseProcessingCli(['--stages','metadata','--stages','thumbnails']));
    assert.throws(()=>parseProcessingCli(['--unknown','x']));
  });
  const album = await prisma.album.create({data:{name:'processing-stage-fixtures',basePath:'/fixtures',sourceType:'File',connectionString:''}});
  await check('discovery does not extract metadata or generate previews', async () => {
    const result = await runner.run({albumId:album.id, stages:['discovery'],timeoutSec:120});
    assert.equal(result.outcome,'success');
    assert.equal(await prisma.file.count({where:{albums:{some:{id:album.id}},isDirectory:false}}),602);
    assert.equal(await prisma.file.count({where:{albums:{some:{id:album.id}},metadataStatus:'Processed',isDirectory:false}}),0);
    assert.equal(await prisma.fileMeta.count({where:{file:{albums:{some:{id:album.id}}}}}),0);
    const details=await load('utils/albumHelper.ts').getAlbum(album.id);
    assert.equal(details.fileStatus.reduce((sum,status)=>sum+status.fileCount,0),602);
  });
  const image = await prisma.file.findFirstOrThrow({where:{path:'mixed/change.jpg'}});
  const video = await prisma.file.findFirstOrThrow({where:{path:'mixed/synthetic-video.mp4'}});
  await check('thumbnail-only ignores metadata errors and preserves metadata exactly', async () => {
    await prisma.file.update({where:{id:image.id},data:{metadataStatus:'Error',metadataProcessingError:'existing metadata failure'}});
    const before = await metadataSnapshot(image.id);
    await refresh(image.id,['thumbnails']);
    assert.equal(await metadataSnapshot(image.id),before);
    assert.equal((await file(image.id)).thumbnailStatus,'Processed');
    const Jimp = requireApp('jimp');
    for (const size of thumbnailSizes) {
      const thumbnail = await Jimp.read(getFileThumbnailPath(image,size));
      assert.equal(Math.max(thumbnail.bitmap.width,thumbnail.bitmap.height),size);
    }
  });
  await check('metadata-only ignores thumbnail errors and preserves all preview bytes/state', async () => {
    await prisma.file.update({where:{id:image.id},data:{thumbnailStatus:'Error',thumbnailProcessingError:'existing thumbnail failure'}});
    const before = await thumbnailsSnapshot(image.id);
    await refresh(image.id,['metadata']);
    assert.equal(await thumbnailsSnapshot(image.id),before);
    assert.equal((await file(image.id)).metadataStatus,'Processed');
  });
  await check('refresh removes absent extracted keys and preserves manual/legacy values', async () => {
    for (const [key,origin] of [['removed-exif-key','Extracted'],['manual-key','Manual'],['unknown-history-key','Legacy']]) {
      await prisma.fileMeta.create({data:{fileId:image.id,metaKey:key,type:'String',stringValue:key,origin}});
    }
    const { updateFileMetaEntry } = load('utils/fileHelper.ts');
    await updateFileMetaEntry(await file(image.id),{key:'resolution_x',type:'Int',value:123});
    await refresh(image.id,['metadata']);
    assert.equal(await prisma.fileMeta.count({where:{fileId:image.id,metaKey:'removed-exif-key'}}),0);
    const values = await prisma.fileMeta.findMany({where:{fileId:image.id}});
    assert(values.some(v=>v.metaKey==='manual-key' && v.origin==='Manual'));
    assert(values.some(v=>v.metaKey==='unknown-history-key' && v.origin==='Legacy'));
    assert(values.some(v=>v.metaKey==='resolution_x' && v.origin==='Manual' && v.intValue===123));
  });
  await check('only rolled-back write conflicts retry the complete metadata transaction', async () => {
    const original=prisma.$transaction.bind(prisma);
    let attempts=0;
    prisma.$transaction=async (...args)=>{
      if(++attempts<=2) throw Object.assign(new Error('fixture rolled-back conflict'),{code:'P2034'});
      return original(...args);
    };
    try { await refresh(image.id,['metadata']); assert.equal(attempts,3); }
    finally { prisma.$transaction=original; }
    attempts=0;
    prisma.$transaction=async ()=>{attempts++; throw Object.assign(new Error('fixture connection failure'),{code:'P1001'});};
    try { await assert.rejects(refresh(image.id,['metadata']),ProcessingFailedError); assert.equal(attempts,1); }
    finally { prisma.$transaction=original; }
    await refresh(image.id,['metadata']);
  });
  await check('metadata failure does not prevent successful thumbnails', async () => {
    const original = factory.getMetadataExtractor;
    factory.getMetadataExtractor = () => async () => {throw new Error('fixture extraction failure');};
    try {
      await assert.rejects(refresh(image.id,['metadata','thumbnails']),ProcessingFailedError);
      const row = await file(image.id);
      assert.equal(row.metadataStatus,'Error'); assert.equal(row.thumbnailStatus,'Processed');
    } finally { factory.getMetadataExtractor = original; }
  });
  await check('thumbnail failure does not invalidate metadata and retains usable previews', async () => {
    await refresh(video.id,['thumbnails']);
    const before = JSON.parse(await thumbnailsSnapshot(video.id)).hashes;
    const original = commands.mediaCommand;
    const calls = [];
    commands.mediaCommand = async (executable,args) => {
      calls.push(path.basename(executable));
      if (path.basename(executable)==='ffmpeg') throw new Error('fixture video generation failure');
      return original(executable,args);
    };
    try {
      await assert.rejects(refresh(video.id,['metadata','thumbnails']),ProcessingFailedError);
      const row = await file(video.id);
      assert.equal(row.metadataStatus,'Processed'); assert.equal(row.thumbnailStatus,'Error');
      assert.deepEqual(JSON.parse(await thumbnailsSnapshot(video.id)).hashes,before);
      assert(calls.includes('ffprobe') && calls.includes('ffmpeg'));
      calls.length=0;
      const snapshot = await thumbnailsSnapshot(video.id);
      await refresh(video.id,['metadata']);
      assert.equal(await thumbnailsSnapshot(video.id),snapshot);
      assert(!calls.includes('ffmpeg'));
    } finally { commands.mediaCommand = original; }
  });
  await check('partial generation and publication DB failures retain every prior size', async () => {
    const before = JSON.parse(await thumbnailsSnapshot(image.id)).hashes;
    const metadataBefore=await metadataSnapshot(image.id);
    const originalGenerator=factory.getThumbnailGenerator;
    factory.getThumbnailGenerator=()=>async (_file,outputs)=>{
      await fs.writeFile([...outputs.values()][0],'new partial preview');
      throw new Error('fixture partial generation failure');
    };
    try { await assert.rejects(refresh(image.id,['thumbnails']),ProcessingFailedError); }
    finally { factory.getThumbnailGenerator=originalGenerator; }
    assert.deepEqual(JSON.parse(await thumbnailsSnapshot(image.id)).hashes,before);
    factory.getThumbnailGenerator=()=>async (_file,outputs)=>{
      for(const [size,output] of outputs) await fs.writeFile(output,`different preview for ${size}`);
    };
    const original = prisma.file.update.bind(prisma.file);
    let rejected=false;
    prisma.file.update = async (args) => {
      if (!rejected && args.data.thumbnailStatus==='Processed') {rejected=true; throw new Error('fixture commit failure');}
      return original(args);
    };
    try { await assert.rejects(refresh(image.id,['thumbnails']),ProcessingFailedError); }
    finally { prisma.file.update = original; factory.getThumbnailGenerator=originalGenerator; }
    assert(rejected);
    assert.deepEqual(JSON.parse(await thumbnailsSnapshot(image.id)).hashes,before);
    assert.equal(await metadataSnapshot(image.id),metadataBefore);
    assert(!(await fs.readdir(path.dirname(getFileThumbnailPath(image,thumbnailSizes[0])))).some(name=>name.startsWith('.generation-')));
  });
  await check('unsupported stages terminate independently; directories never enter extraction', async () => {
    const unsupported = await prisma.file.findFirstOrThrow({where:{path:'wide/entry-0.txt'}});
    await refresh(unsupported.id,['metadata','thumbnails']);
    const row = await file(unsupported.id);
    assert.equal(row.metadataStatus,'NotSupported'); assert.equal(row.thumbnailStatus,'NotSupported');
    const directory = await prisma.file.findFirstOrThrow({where:{isDirectory:true}});
    await assert.rejects(refresh(directory.id,['metadata']));
  });
  await check('changed source defers publication and retains old previews', async () => {
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(),'hmv-i3-source-'));
    try {
      const source = path.join(temporary,'image.jpg');
      await fs.copyFile('/fixtures/mixed/change.jpg',source);
      const stat = await fs.stat(source);
      const row = await prisma.file.create({data:{path:path.relative('/fixtures',source),name:'source-change',extension:'jpg',
        sourceVersion:sourceVersion(stat),size:stat.size,modifiedAt:stat.mtime}});
      await refresh(row.id,['metadata','thumbnails']);
      const before = JSON.parse(await thumbnailsSnapshot(row.id)).hashes;
      const original = factory.getThumbnailGenerator;
      factory.getThumbnailGenerator = target => async (f,outputs) => {
        await original(target)(f,outputs); await fs.appendFile(source,'changed during generation');
      };
      try {
        const result = await refresh(row.id,['thumbnails']);
        assert.equal(result.outcome,'partial'); assert.equal(result.stages.thumbnails.deferred,1);
      } finally { factory.getThumbnailGenerator=original; }
      assert.equal((await file(row.id)).thumbnailStatus,'New');
      assert.deepEqual(JSON.parse(await thumbnailsSnapshot(row.id)).hashes,before);
      const restarted=spawnSync(process.execPath,['-r','ts-node/register/transpile-only','-r','tsconfig-paths/register',
        'src/backgroundProcesses/updateMetadata.ts','--stages','thumbnails','--file',row.id],
        {cwd:app,encoding:'utf8',timeout:120000});
      assert.equal(restarted.status,0,restarted.stderr);
      assert.equal((await file(row.id)).thumbnailStatus,'Processed');
      await prisma.fileMeta.deleteMany({where:{fileId:row.id}});
      await prisma.file.delete({where:{id:row.id}});
    } finally { await fs.rm(temporary,{recursive:true,force:true}); }
  });
  const login = await request('/api/login',{email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD});
  assert.equal(login.result.ok,true);
  cookie=login.response.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
  await check('authenticated stage API, repeated invocation and input rejection', async () => {
    assert.equal((await request('/api/process/run',{stages:['metadata'],fileId:image.id},'POST','')).response.status,403);
    assert.equal((await request('/api/process/run',{stages:['invalid']})).response.status,400);
    await refresh(image.id,['metadata','thumbnails']);
    const before = await metadataSnapshot(image.id);
    for (let index=0; index<2; index++) {
      const response = await request('/api/process/run',{stages:['thumbnails'],fileId:image.id,mode:'refresh'});
      assert.equal(response.response.status,200); assert.equal(response.result.data.stages.thumbnails.succeeded,1);
    }
    assert.equal(await metadataSnapshot(image.id),before);
    const pending = await request('/api/process/run',{stages:['thumbnails'],fileId:image.id});
    assert.equal(pending.result.data.stages.thumbnails.attempted,0);
    const directory=await prisma.file.findFirstOrThrow({where:{isDirectory:true}});
    const directoryBefore=await metadataSnapshot(directory.id);
    assert.equal((await request('/api/file/metadata',{id:directory.id})).response.status,200);
    assert.equal(await metadataSnapshot(directory.id),directoryBefore);
    assert.equal((await request('/api/process/run',{fileId:directory.id,stages:['metadata']})).response.status,400);
  });
  await check('ordinary album members cannot run stages or edit metadata', async () => {
    const admin=await prisma.user.findFirstOrThrow({where:{email:process.env.ADMIN_EMAIL}});
    await prisma.user.create({data:{name:'Stage viewer',email:'stage-viewer@example.invalid',password:admin.password,
      albums:{connect:{id:album.id}}}});
    const login=await request('/api/login',{email:'stage-viewer@example.invalid',password:process.env.ADMIN_PASSWORD});
    const viewer=login.response.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
    const before=await metadataSnapshot(image.id);
    assert.equal((await request('/api/process/run',{stages:['metadata'],fileId:image.id},'POST',viewer)).response.status,403);
    assert.equal((await request(`/api/file/${image.id}/metadata`,{key:'manual-key',type:'String',value:'forbidden'},'PATCH',viewer)).response.status,403);
    assert.equal(await metadataSnapshot(image.id),before);
  });
  await check('common lock rejects concurrent API/reset/edit/create and independent jobs', async () => {
    let release, entered;
    const gate = new Promise(resolve=>{release=resolve;});
    const started = new Promise(resolve=>{entered=resolve;});
    const held = withProcessingLock(async ()=>{entered(); await gate;});
    await started;
    try {
      await assert.rejects(refresh(image.id,['metadata']),IndexingBusyError);
      for (const [url,body,method] of [
        ['/api/process/run',{stages:['metadata'],fileId:image.id},'POST'],
        ['/api/file/metadata',{id:image.id},'DELETE'],
        [`/api/file/${image.id}/metadata`,{key:'lock-test',type:'String',value:'blocked'},'PATCH'],
        ['/api/album',{path:'mixed',name:'blocked-album'},'PUT'],
      ]) assert.equal((await request(url,body,method)).response.status,409,url);
    } finally { release(); await held; }
    assert.equal((await readIndexingState()).outcome,'success');
  });
  await check('CLI metadata-only refresh and invalid-option exit status', async () => {
    const before = await thumbnailsSnapshot(image.id);
    const args=['-r','ts-node/register/transpile-only','-r','tsconfig-paths/register','src/backgroundProcesses/updateMetadata.ts'];
    const result=spawnSync(process.execPath,[...args,'--stages','metadata','--file',image.id,'--mode','refresh'],{cwd:app,encoding:'utf8',timeout:120000});
    assert.equal(result.status,0,result.stderr);
    assert.equal(await thumbnailsSnapshot(image.id),before);
    assert.equal(spawnSync(process.execPath,[...args,'--stages','invalid'],{cwd:app,stdio:'ignore',timeout:30000}).status,1);
  });
  await check('legacy authenticated background entry point composes all stages', async () => {
    const rejected=await fetch('http://background:3000/api/process/updateMetadata');
    assert.equal(rejected.status,403);
    const response=await fetch('http://background:3000/api/process/updateMetadata',{
      headers:{Authorization:`Bearer ${process.env.PROCESS_TOKEN}`},signal:AbortSignal.timeout(120000)});
    if(response.status!==200) process.stderr.write(JSON.stringify({failedFiles:await prisma.file.findMany({
      where:{OR:[{metadataStatus:'Error'},{thumbnailStatus:'Error'}]},
      select:{path:true,metadataStatus:true,thumbnailStatus:true,metadataProcessingError:true,thumbnailProcessingError:true}})})+'\n');
    assert.equal(response.status,200);
    const result=await response.json();
    assert.equal(result.ok,true);
    assert.deepEqual(Object.keys(result.data.stages),['discovery','metadata','thumbnails']);
    assert.equal(result.data.outcome,'success');
    const legacyFile=await request('/api/file/metadata',{id:image.id});
    assert.equal(legacyFile.response.status,200); assert.equal(legacyFile.result.id,image.id);
    assert.equal((await request('/api/album/metadata',{id:album.id})).response.status,200);
    assert.equal((await request('/api/album/sync',{id:album.id})).response.status,200);
  });
  await check('benchmark recorder supports real independent-stage jobs', async () => {
    await prisma.file.updateMany({where:{isDirectory:false,albums:{some:{id:album.id}}},
      data:{metadataStatus:'New',thumbnailStatus:'New'}});
    for (const mode of ['metadata','thumbnails']) {
      const result=spawnSync(process.execPath,['/benchmark/benchmark.cjs',mode],{cwd:app,encoding:'utf8',timeout:120000});
      assert.equal(result.status,0,result.stderr);
      const measured=JSON.parse(result.stdout.trim().split('\n').at(-1));
      assert.equal(measured.failure,null);
      assert.equal(measured.metrics.jobs.media.attempted,602);
      assert.equal(measured.metrics.ffmpeg,mode==='metadata'?0:3);
      assert.equal(measured.metrics.ffprobe,mode==='metadata'?3:0);
      assert.equal(measured.metrics.imageDecodes,mode==='metadata'?0:99);
      stageSmoke.push(measured);
    }
  });
  originalLog(JSON.stringify({checks:checks.length,passed:checks,stageSmoke}));
}
main().catch(error=>{process.stderr.write(`${error.stack}\n`);process.exitCode=1;}).finally(async()=>{await prisma.$disconnect();});
