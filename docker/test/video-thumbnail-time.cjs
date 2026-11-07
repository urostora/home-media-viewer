// Real custom-frame checks in the disposable benchmark database/storage only.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const cp = require('node:child_process');
const { createRequire } = require('node:module');
const app = createRequire('/home/node/app/package.json');
app('ts-node').register({transpileOnly:true,project:'/home/node/app/tsconfig.json'});
app('tsconfig-paths/register');
const load = name => app(`./src/${name}`);
const prisma = load('utils/prisma/prismaImporter').default;
const { default:runner, ProcessingFailedError } = load('utils/processes/updateMetadataProcess');
const { validateProcessingOptions, VideoThumbnailTimeError } = load('types/processingTypes');
const { parseProcessingCli } = load('utils/processes/processingCli');
const video = load('utils/fileProcessor/video');
const commands = load('utils/mediaCommand');
const { readProcessingRun } = load('utils/processes/runJournal');
const { getFileThumbnailPath } = load('utils/thumbnailHelper');
const Jimp = app('jimp');
const sizes = [200,600,1280];
const checks = [];
const originalLog = console.log;
console.log = () => {};
async function check(name, test) { await test(); checks.push(name); originalLog(JSON.stringify({check:name,passed:true})); }
const ffmpeg = args => cp.execFileSync('/usr/bin/ffmpeg',['-v','error','-y',...args],{stdio:'pipe'});
async function row(id) { return prisma.file.findUniqueOrThrow({where:{id}}); }
async function metadata(id) {
  const value = await row(id);
  for (const key of ['thumbnailStatus','thumbnailProcessedAt','thumbnailProcessingError','thumbnailSourceVersion']) delete value[key];
  return JSON.stringify({file:value,metas:await prisma.fileMeta.findMany({where:{fileId:id,metaKey:{not:'video_thumbnail_time'}},orderBy:{id:'asc'}})});
}
async function selection(file, time) {
  const values=await prisma.fileMeta.findMany({where:{fileId:file.id,metaKey:'video_thumbnail_time'}});
  assert.equal(values.length,1);
  assert.equal(values[0].type,'Float');
  assert.equal(values[0].origin,'Manual');
  assert.equal(values[0].floatValue,time);
  return values[0];
}
async function previews(file) { return Promise.all(sizes.map(size=>fs.readFile(getFileThumbnailPath(file,size)))); }
async function main() {
  assert.equal(new URL(process.env.DATABASE_URL).pathname,'/benchmark');
  assert.equal(process.env.APP_ALBUM_ROOT_PATH,'/fixtures');
  const directory = await fs.mkdtemp('/tmp/hmv-video-time-');
  let target, album;
  const outputs = prefix => new Map(sizes.map(size=>[size,path.join(directory,`${prefix}-${size}.jpg`)]));
  try {
    await check('strict time options and CLI: zero/fraction allowed; invalid values/stages rejected',async()=>{
      for (const time of [0,1e-7,0.125,1.5]) {
        assert.equal(validateProcessingOptions({stages:['thumbnails'],videoThumbnailTimeSec:time}).videoThumbnailTimeSec,time);
        assert.equal(parseProcessingCli(['--file','x','--video-thumbnail-time',String(time)]).videoThumbnailTimeSec,time);
      }
      for (const time of [NaN,Infinity,-Infinity,-0.01,null,'1',true])
        assert.throws(()=>validateProcessingOptions({stages:['thumbnails'],videoThumbnailTimeSec:time}),/finite nonnegative/);
      assert.throws(()=>validateProcessingOptions({stages:['metadata'],videoThumbnailTimeSec:1}),/requires the thumbnails/);
      for (const time of ['NaN','Infinity','-1',''])
        assert.throws(()=>parseProcessingCli(['--video-thumbnail-time',time]));
      assert.throws(()=>parseProcessingCli(['--video-thumbnail-time','0','--video-thumbnail-time','1']));
    });
    const source = path.join(directory,'changing.mp4');
    // Three unmistakable frames over three seconds, with ten frames per second.
    ffmpeg(['-f','lavfi','-i','color=c=red:size=320x180:rate=10:d=1',
      '-f','lavfi','-i','color=c=green:size=320x180:rate=10:d=1',
      '-f','lavfi','-i','color=c=blue:size=320x180:rate=10:d=1',
      '-filter_complex_threads','1','-filter_complex','[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]',
      '-map','[v]','-threads','1','-c:v','mpeg4',source]);
    const stat = await fs.stat(source);
    target = await prisma.file.create({data:{path:path.relative('/fixtures',source),name:'changing',extension:'mp4',
      size:stat.size,modifiedAt:stat.mtime}});
    await runner.run({fileId:target.id,stages:['metadata'],mode:'refresh'});
    await prisma.fileMeta.create({data:{fileId:target.id,metaKey:'custom-time-manual',origin:'Manual',type:'String',stringValue:'keep'}});
    const metadataBefore = await metadata(target.id);
    const refresh = time => runner.run({fileId:target.id,stages:['thumbnails'],mode:'refresh',
      ...(time === undefined ? {} : {videoThumbnailTimeSec:time})});
    let baseline;
    await check('default and zero preserve first frame; fractional time shares one decode across all sizes',async()=>{
      let ffmpegCount=0, probeCount=0;
      const original = commands.mediaCommand;
      commands.mediaCommand = async(executable,args)=>{
        if (path.basename(executable)==='ffmpeg') ffmpegCount++;
        if (path.basename(executable)==='ffprobe') {
          probeCount++;
          assert(args.includes('stream=duration:format=duration'));
          assert(!args.includes('-show_streams'));
        }
        return original(executable,args);
      };
      try {
        await refresh(); baseline = await previews(target);
        assert.equal(ffmpegCount,1); assert.equal(probeCount,0);
        await refresh(0); assert.deepEqual(await previews(target),baseline); await selection(target,0);
        for (const [time,channel] of [[1e-7,0],[1.5,1],[2.5,2],[2.9,2]]) {
          const before=[ffmpegCount,probeCount];
          const result=await refresh(time);
          assert.equal(ffmpegCount-before[0],1); assert.equal(probeCount-before[1],1);
          const record=await readProcessingRun(result.runId);
          assert.equal(record.videoThumbnailTimeSec,time);
          await selection(target,time);
          for (const size of sizes) {
            const image=await Jimp.read(getFileThumbnailPath(target,size));
            assert.equal(image.bitmap.width,size);
            const channels=Object.values(Jimp.intToRGBA(image.getPixelColor(0,0))).slice(0,3);
            assert(channels[channel]>90);
            assert(channels.every((value,index)=>index===channel || value<15));
          }
        }
        const custom=await previews(target);
        await refresh(); assert.deepEqual(await previews(target),custom);
        await selection(target,2.9);
        assert.equal((await readProcessingRun()).videoThumbnailTimeSec,undefined);
        await refresh(0); assert.deepEqual(await previews(target),baseline); await selection(target,0);
      } finally { commands.mediaCommand=original; }
      assert.equal(await metadata(target.id),metadataBefore);
    });
    await check('fractional selection matches accurate FFmpeg seeking for moving and rotated video',async()=>{
      const moving=path.join(directory,'moving.mp4'), rotated=path.join(directory,'rotated.mp4');
      ffmpeg(['-f','lavfi','-i','testsrc2=size=320x180:rate=10','-t','3','-threads','1','-c:v','mpeg4',moving]);
      ffmpeg(['-i',moving,'-c','copy','-metadata:s:v:0','rotate=90',rotated]);
      for (const source of [moving,rotated]) {
        const file={path:path.relative('/fixtures',source)};
        const actual=outputs('accurate');
        await video.generateVideoThumbnails(file,actual,1.25);
        for (const [size,output] of actual) {
          const reference=path.join(directory,'reference.jpg');
          ffmpeg(['-threads','1','-ss','1.25','-i',source,'-threads','1','-filter_threads','1',
            '-frames:v','1','-vf',`scale=${size}:-1`,reference]);
          const expected=await Jimp.read(reference), result=await Jimp.read(output);
          assert.deepEqual(result.bitmap,expected.bitmap);
        }
      }
    });
    await check('invalid/end/past-duration times retain previews, success timestamp and all metadata',async()=>{
      for (const time of [-1,NaN,Infinity]) {
        await assert.rejects(refresh(time),/finite nonnegative/);
        assert.deepEqual(await previews(target),baseline);
      }
      const success=(await row(target.id)).thumbnailProcessedAt;
      const saved=await selection(target,0);
      for (const time of [3,3.1,1e100]) {
        await assert.rejects(refresh(time),ProcessingFailedError);
        const current=await row(target.id);
        assert.equal(current.thumbnailStatus,'Error');
        assert.match(current.thumbnailProcessingError,/less than the video duration/);
        assert.deepEqual(current.thumbnailProcessedAt,success);
        assert.deepEqual(await selection(target,0),saved);
        assert.deepEqual(await previews(target),baseline);
        assert.equal(await metadata(target.id),metadataBefore);
      }
      for (const time of [-1,NaN,Infinity])
        await assert.rejects(video.generateVideoThumbnails(target,outputs('invalid'),time),VideoThumbnailTimeError);
    });
    await check('unknown duration, absent video stream and failed decoding keep previously usable output',async()=>{
      const original=commands.mediaCommand;
      try {
        for (const probe of [{streams:[]},{streams:[{duration:'N/A'}],format:{duration:'N/A'}}]) {
          commands.mediaCommand=async(executable,args)=>path.basename(executable)==='ffprobe'?JSON.stringify(probe):original(executable,args);
          await assert.rejects(refresh(1),ProcessingFailedError);
          assert.match((await row(target.id)).thumbnailProcessingError,/no video stream|duration is unavailable/);
          assert.deepEqual(await previews(target),baseline);
        }
        commands.mediaCommand=async(executable,args)=>path.basename(executable)==='ffmpeg' ? '' : original(executable,args);
        await assert.rejects(refresh(1),ProcessingFailedError);
        assert.match((await row(target.id)).thumbnailProcessingError,/No video frame/);
        assert.deepEqual(await previews(target),baseline);
        // Container duration fallback for formats without stream duration (e.g. Matroska).
        commands.mediaCommand=async(executable,args)=>path.basename(executable)==='ffprobe'
          ? JSON.stringify({streams:[{}],format:{duration:'3.0'}}) : original(executable,args);
        await refresh(1.5);
        const before=await previews(target);
        commands.mediaCommand=async(executable,args)=>{
          if (path.basename(executable)==='ffmpeg') throw new Error('forced decode failure');
          return original(executable,args);
        };
        await assert.rejects(refresh(2.5),ProcessingFailedError);
        assert.deepEqual(await previews(target),before);
        assert.equal(await metadata(target.id),metadataBefore);
        await selection(target,1.5);
      } finally { commands.mediaCommand=original; }
      await refresh();
      const abandoned=(await fs.readdir(path.dirname(getFileThumbnailPath(target,200)))).filter(name=>name.startsWith('.generation-'));
      assert.deepEqual(abandoned,[]);
    });
    await check('saved selections survive full metadata refresh and album processing; zero explicitly overrides',async()=>{
      await refresh(2.5);
      const custom=await previews(target), saved=await selection(target,2.5);
      await runner.run({fileId:target.id,stages:['metadata','thumbnails'],mode:'refresh'});
      assert.deepEqual(await previews(target),custom);
      assert.deepEqual(await selection(target,2.5),saved);
      album=await prisma.album.create({data:{name:'saved-time-test',sourceType:'File',connectionString:'',basePath:'',files:{connect:{id:target.id}}}});
      await runner.run({albumId:album.id,stages:['thumbnails'],mode:'refresh'});
      assert.deepEqual(await previews(target),custom);
      await prisma.file.update({where:{id:target.id},data:{thumbnailStatus:'New'}});
      await runner.run({albumId:album.id,stages:['thumbnails'],mode:'pending'});
      assert.deepEqual(await previews(target),custom);
      await refresh(0); await selection(target,0);
      assert.deepEqual(await previews(target),baseline);
    });
    await check('invalid saved selection preserves full and partial previews; missing previews use default without overwriting selection',async()=>{
      await refresh(2.5);
      const custom=await previews(target);
      const set=async value=>prisma.fileMeta.update({where:{fileId_metaKey:{fileId:target.id,metaKey:'video_thumbnail_time'}},data:value});
      // Simulate a shorter replacement source without changing the source mount.
      const original=commands.mediaCommand;
      try {
        commands.mediaCommand=async(executable,args)=>path.basename(executable)==='ffprobe'
          ? JSON.stringify({streams:[{duration:'1'}]}) : original(executable,args);
        await assert.rejects(refresh(),ProcessingFailedError);
        assert.deepEqual(await previews(target),custom); await selection(target,2.5);
      } finally { commands.mediaCommand=original; }
      await set({floatValue:3});
      await assert.rejects(refresh(),ProcessingFailedError);
      assert.deepEqual(await previews(target),custom);
      await fs.rm(getFileThumbnailPath(target,200));
      await fs.rm(getFileThumbnailPath(target,600));
      await assert.rejects(refresh(),ProcessingFailedError);
      assert.deepEqual(await fs.readFile(getFileThumbnailPath(target,1280)),custom[2]);
      await fs.rm(getFileThumbnailPath(target,1280));
      await refresh(); assert.deepEqual(await previews(target),baseline); await selection(target,3);
      for (const value of [{floatValue:-1},{type:'String',floatValue:null,stringValue:'bad'}]) {
        await set(value);
        await assert.rejects(refresh(),ProcessingFailedError);
        assert.deepEqual(await previews(target),baseline);
        await Promise.all(sizes.map(size=>fs.rm(getFileThumbnailPath(target,size))));
        await refresh(); assert.deepEqual(await previews(target),baseline);
      }
      await refresh(0);
      const saved=await selection(target,0);
      assert.equal(saved.stringValue,null);
    });
    await check('source-change and database commit failures restore thumbnails and do not save a new selection',async()=>{
      const identity=load('utils/processes/sourceIdentity');
      const originalAssert=identity.assertSourceVersion;
      const originalTransaction=prisma.$transaction;
      const before=await previews(target), saved=await selection(target,0);
      const success=(await row(target.id)).thumbnailProcessedAt;
      let assertions=0;
      try {
        identity.assertSourceVersion=async(...args)=>{
          await originalAssert(...args);
          if (++assertions===2) throw new identity.SourceChangedError('forced post-publication source change');
        };
        const interrupted=await refresh(1.5);
        assert.equal(interrupted.outcome,'partial');
        assert.equal(interrupted.stages.thumbnails.deferred,1);
        assert.equal((await row(target.id)).thumbnailStatus,'New');
        assert.deepEqual(await previews(target),before);
        assert.deepEqual(await selection(target,0),saved);
        identity.assertSourceVersion=originalAssert;
        let upserted=false;
        prisma.$transaction=(callback,...args)=>originalTransaction.call(prisma,async transaction=>{
          const proxy=new Proxy(transaction,{get(object,key){
            if(key!=='fileMeta') return object[key];
            return new Proxy(object.fileMeta,{get(model,method){
              if(method!=='upsert') return model[method];
              return async options=>{await model.upsert(options); upserted=true; throw new Error('forced transaction rollback');};
            }});
          }});
          return callback(proxy);
        },...args);
        await assert.rejects(refresh(1.5),ProcessingFailedError);
        assert(upserted);
        assert.equal((await row(target.id)).thumbnailStatus,'Error');
        assert.deepEqual((await row(target.id)).thumbnailProcessedAt,success);
        assert.deepEqual(await previews(target),before);
        assert.deepEqual(await selection(target,0),saved);
        await prisma.fileMeta.delete({where:{id:saved.id}});
        await assert.rejects(refresh(1.5),ProcessingFailedError);
        assert.deepEqual(await previews(target),before);
        assert.equal(await prisma.fileMeta.count({where:{fileId:target.id,metaKey:'video_thumbnail_time'}}),0);
      } finally {
        identity.assertSourceVersion=originalAssert;
        prisma.$transaction=originalTransaction;
      }
      assert.deepEqual((await fs.readdir(path.dirname(getFileThumbnailPath(target,200)))).filter(name=>name.startsWith('.generation-')),[]);
    });
    const shared=await prisma.file.findFirstOrThrow({where:{path:'mixed/synthetic-video.mp4'}});
    let sharedMetadata=await metadata(shared.id);
    async function request(route, body, cookie='') {
      const response=await fetch(`http://app:3000${route}`,{method:'POST',headers:{'content-type':'application/json',cookie},
        body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});
      const text=await response.text();
      let result; try { result=JSON.parse(text); } catch {}
      return {status:response.status,body:result,headers:response.headers};
    }
    const login=await request('/api/login',{email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD});
    assert.equal(login.body.ok,true);
    const cookie=login.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
    await check('authenticated API regenerates custom/zero frames; pending selection and errors preserve metadata',async()=>{
      const options={fileId:shared.id,stages:['thumbnails'],mode:'refresh',videoThumbnailTimeSec:1.25};
      assert.equal((await request('/api/process/run',options)).status,403);
      const before=await previews(shared);
      let result=await request('/api/process/run',options,cookie);
      assert.equal(result.status,200); assert.equal(result.body.data.stages.thumbnails.succeeded,1);
      const saved=await selection(shared,1.25);
      const custom=await previews(shared);
      assert.notDeepEqual(custom,before);
      const expected=outputs('api-expected');
      await video.generateVideoThumbnails(shared,expected,1.25);
      assert.deepEqual(custom,await Promise.all([...expected.values()].map(output=>fs.readFile(output))));
      result=await request('/api/process/run',{...options,mode:'pending',videoThumbnailTimeSec:2},cookie);
      assert.equal(result.body.data.stages.thumbnails.attempted,0); assert.deepEqual(await previews(shared),custom);
      assert.deepEqual(await selection(shared,1.25),saved);
      result=await request('/api/file/metadata',{id:shared.id},cookie);
      assert.equal(result.status,200); assert.deepEqual(await previews(shared),custom);
      assert.deepEqual(await selection(shared,1.25),saved);
      sharedMetadata=await metadata(shared.id);
      for (const time of [-1,null,'1']) {
        result=await request('/api/process/run',{...options,videoThumbnailTimeSec:time},cookie);
        assert.equal(result.status,400); assert.match(result.body.error,/finite nonnegative/);
      }
      assert.equal((await request('/api/process/run',{...options,videoThumbnailTimeSec:3},cookie)).status,500);
      assert.match((await row(shared.id)).thumbnailProcessingError,/less than the video duration/);
      assert.deepEqual(await previews(shared),custom);
      result=await request('/api/process/run',{...options,videoThumbnailTimeSec:0},cookie);
      assert.equal(result.status,200); assert.deepEqual(await previews(shared),before);
      await selection(shared,0);
      assert.equal(await metadata(shared.id),sharedMetadata);
    });
    await check('real CLI passes fractional/zero times and reports invalid and out-of-range failures',async()=>{
      const args=['-r','ts-node/register/transpile-only','-r','tsconfig-paths/register','src/backgroundProcesses/updateMetadata.ts',
        '--file',shared.id,'--stages','thumbnails','--mode','refresh','--video-thumbnail-time'];
      const cli=time=>cp.spawnSync(process.execPath,[...args,time],{cwd:'/home/node/app',encoding:'utf8',timeout:120000});
      let result=cli('1.25'); assert.equal(result.status,0,result.stderr); await selection(shared,1.25);
      const expected=outputs('cli-expected'); await video.generateVideoThumbnails(shared,expected,1.25);
      const custom=await previews(shared);
      assert.deepEqual(custom,await Promise.all([...expected.values()].map(output=>fs.readFile(output))));
      result=cli('Infinity'); assert.equal(result.status,1); assert.match(result.stderr,/finite nonnegative/);
      result=cli('3'); assert.equal(result.status,1); assert.deepEqual(await previews(shared),custom);
      const reused=cp.spawnSync(process.execPath,args.slice(0,-1),{cwd:'/home/node/app',encoding:'utf8',timeout:120000});
      assert.equal(reused.status,0,reused.stderr); assert.deepEqual(await previews(shared),custom);
      assert.equal(cli('0').status,0); await selection(shared,0);
      assert.equal(await metadata(shared.id),sharedMetadata);
    });
    await check('video time leaves image generation and image metadata unchanged',async()=>{
      const image=await prisma.file.findFirstOrThrow({where:{path:'mixed/change.jpg'}});
      const before=await previews(image), state=await metadata(image.id);
      const result=await runner.run({fileId:image.id,stages:['thumbnails'],mode:'refresh',videoThumbnailTimeSec:1e100});
      assert.equal(result.stages.thumbnails.succeeded,1);
      assert.deepEqual(await previews(image),before);
      assert.equal(await metadata(image.id),state);
    });
    originalLog(JSON.stringify({passed:true,checks}));
  } finally {
    if (album) await prisma.album.delete({where:{id:album.id}});
    if (target) {
      await prisma.fileMeta.deleteMany({where:{fileId:target.id}});
      await prisma.file.delete({where:{id:target.id}});
      await Promise.all(sizes.map(size=>fs.rm(getFileThumbnailPath(target,size),{force:true})));
    }
    await fs.rm(directory,{recursive:true,force:true});
  }
}
main().catch(error=>{process.stderr.write(`${error.stack}\n`);process.exitCode=1;}).finally(()=>prisma.$disconnect());
