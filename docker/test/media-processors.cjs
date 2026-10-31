// Real media checks; runs in the disposable benchmark worker with read-only source fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const cp = require('node:child_process');
const { createRequire } = require('node:module');
const app = createRequire('/home/node/app/package.json');
app('ts-node').register({transpileOnly:true, project:'/home/node/app/tsconfig.json'});
app('tsconfig-paths/register');
const load = name => app(`./src/utils/${name}`);
const Jimp = app('jimp');
const image = load('fileProcessor/image');
const video = load('fileProcessor/video');
const commands = load('mediaCommand');
const checks = [];
const counts = {image:0, ffmpeg:0, ffprobe:0};
const read = Jimp.read;
Jimp.read = function (...args) { counts.image++; return read.apply(this,args); };
const command = commands.mediaCommand;
commands.mediaCommand = async (executable,args) => {
  counts[path.basename(executable)]++;
  return command(executable,args);
};
async function check(name, test) { await test(); checks.push(name); }
const file = source => ({path:path.relative('/fixtures',source),name:path.basename(source)});
const ffmpeg = args => cp.execFileSync('/usr/bin/ffmpeg',['-v','error','-y',...args],{stdio:'pipe'});
async function main() {
  const directory = await fs.mkdtemp('/tmp/hmv-media-');
  const outputs = prefix => new Map([200,600,1280].map(size=>[size,path.join(directory,`${prefix}-${size}.jpg`)]));
  try {
    const photo = path.join(directory,'oriented.jpg');
    // Little-endian EXIF orientation 6, on an asymmetric image with distinct corners.
    const bitmap = new Jimp(420,180,0x00aa44ff);
    bitmap.scan(0,0,100,90,function(x,y) { this.setPixelColor(0xff0000ff,x,y); });
    const jpeg = await bitmap.getBufferAsync(Jimp.MIME_JPEG);
    const exif = Buffer.from('45786966000049492a0008000000010012010300010000000600000000000000','hex');
    const marker = Buffer.alloc(4); marker.writeUInt16BE(0xffe1,0); marker.writeUInt16BE(exif.length+2,2);
    await fs.writeFile(photo,Buffer.concat([jpeg.subarray(0,2),marker,exif,jpeg.subarray(2)]));
    await check('one image decode; independent variants match prior bytes and EXIF orientation', async()=>{
      const before = counts.image; const actual = outputs('image');
      await image.generateImageThumbnails(file(photo),actual);
      assert.equal(counts.image-before,1);
      for (const [size,output] of actual) {
        const original = await read(photo);
        assert.equal(original.bitmap.width,180); assert.equal(original.bitmap.height,420);
        const expected = await original.scaleToFit(size,size).quality(size<400?50:75).getBufferAsync(Jimp.MIME_JPEG);
        assert.deepEqual(await fs.readFile(output),expected);
      }
    });
    const tagged = path.join(directory,'tagged.mp4');
    ffmpeg(['-f','lavfi','-i','testsrc2=size=480x270:rate=30000/1001','-t','1','-threads','1','-c:v','mpeg4',
      '-movflags','use_metadata_tags','-metadata','manufacturer=Fixture Maker','-metadata','model=Fixture Camera',
      '-metadata','location=+48.1250-011.5000/','-metadata','creation_time=2020-03-04T05:06:07Z',tagged]);
    const rotated = path.join(directory,'rotated.mp4');
    ffmpeg(['-i',tagged,'-c','copy','-metadata:s:v:0','rotate=90',rotated]);
    await check('one structured probe; custom format/stream metadata and rational FPS retained', async()=>{
      const before = {...counts}; const metadata = await video.extractVideoMetadata(file(tagged));
      assert.equal(counts.ffprobe-before.ffprobe,1); assert.equal(counts.ffmpeg-before.ffmpeg,0);
      const values = metadata.entries;
      assert.equal(values.get('model').stringValue,'Fixture Camera');
      assert.equal(values.get('make').stringValue,'Fixture Maker');
      assert.equal(values.get('gps_coordinates').latitude,48.125);
      assert.equal(values.get('gps_coordinates').longitude,-11.5);
      assert.equal(metadata.contentDate.toISOString(),'2020-03-04T05:06:07.000Z');
      assert.equal(values.get('fps').floatValue,30000/1001);
      assert.equal(values.get('resolution_x').intValue,480);
      assert.equal(values.get('resolution_y').intValue,270);
      assert.equal(values.get('codec').stringValue,'mpeg4');
      assert.ok(values.get('encoder').stringValue);
    });
    await check('existing video fixture custom fields match the previous text probe',async()=>{
      for (const source of ['/fixtures/mixed/reference-video-1.mp4','/fixtures/mixed/reference-video-2.mp4']) {
        const probe = cp.spawnSync('/usr/bin/ffprobe',['-hide_banner',source],{encoding:'utf8'});
        assert.equal(probe.status,0);
        const previous = probe.stdout+probe.stderr;
        const result = await video.extractVideoMetadata(file(source));
        for (const [key,metaKey] of [['manufacturer','make'],['model','model'],['encoder','encoder']]) {
          const expected = previous.match(new RegExp(`${key}\\s*:\\s*([^\\n]+)`,'i'))?.[1].trim();
          if (expected !== undefined) assert.equal(result.entries.get(metaKey)?.stringValue,expected);
        }
        const location = previous.match(/location\s*:\s*(?<lat>[+-][\d.]+)(?<lon>[+-][\d.]+)/i);
        if (location !== null) {
          assert.equal(result.entries.get('gps_coordinates').latitude,Number(location.groups.lat));
          assert.equal(result.entries.get('gps_coordinates').longitude,Number(location.groups.lon));
        }
      }
    });
    await check('structured tags preserve container precedence, namespaced keys and stream fallbacks',async()=>{
      const original = commands.mediaCommand;
      try {
        commands.mediaCommand = async()=>JSON.stringify({
          format:{tags:{'com.android.manufacturer':'Container Maker','com.android.model':'Container Model',
            location:'+12.5-034.25/','creation_time':'2019-02-03T04:05:06Z'}},
          streams:[{codec_type:'video',avg_frame_rate:'0/0',r_frame_rate:'25/1',tags:{
            manufacturer:'Stream Maker',model:'Stream Model',encoder:'Stream Encoder',creation_time:'2021-01-02T03:04:05Z'}}],
        });
        const result = await video.extractVideoMetadata(file(tagged));
        assert.equal(result.entries.get('make').stringValue,'Container Maker');
        assert.equal(result.entries.get('model').stringValue,'Container Model');
        assert.equal(result.entries.get('encoder').stringValue,'Stream Encoder');
        assert.equal(result.entries.get('fps').floatValue,25);
        assert.equal(result.contentDate.toISOString(),'2021-01-02T03:04:05.000Z');
        commands.mediaCommand = async()=>JSON.stringify({format:{tags:{creation_time:'2019-02-03T04:05:06Z'}},
          streams:[{codec_type:'video',tags:{}}]});
        assert.equal((await video.extractVideoMetadata(file(tagged))).contentDate.toISOString(),'2019-02-03T04:05:06.000Z');
        for (const malformed of ['null','{}','{"streams":[]}','{"streams":[{"codec_type":"audio"}]}']) {
          commands.mediaCommand = async()=>malformed;
          await assert.rejects(video.extractVideoMetadata(file(tagged)));
        }
      } finally { commands.mediaCommand=original; }
    });
    await check('single FFmpeg job; first frame, orientation, aspect and decoded JPEG pixels match prior commands',async()=>{
      const sources = [tagged,rotated,'/fixtures/mixed/reference-video-1.mp4','/fixtures/mixed/reference-video-2.mp4'];
      for (const [index,source] of sources.entries()) {
        const before = {...counts}; const actual = outputs(`video-${index}`);
        await video.generateVideoThumbnails(file(source),actual);
        assert.equal(counts.ffmpeg-before.ffmpeg,1); assert.equal(counts.ffprobe-before.ffprobe,0);
        for (const [size,output] of actual) {
          const previous = path.join(directory,'previous.jpg');
          ffmpeg(['-threads','1','-i',source,'-threads','1','-filter_threads','1','-frames:v','1','-vf',`scale=${size}:-1`,previous]);
          const expected = await read(previous); const result = await read(output);
          assert.equal(result.bitmap.width,size);
          assert.equal(result.bitmap.height,expected.bitmap.height);
          assert.deepEqual(result.bitmap.data,expected.bitmap.data);
        }
      }
    });
    await check('large image decodes once; corrupt sources and missing outputs reject',async()=>{
      const large = path.join(directory,'large.jpg');
      await new Jimp(4000,3000,0x987654ff).writeAsync(large);
      const before = counts.image;
      await image.generateImageThumbnails(file(large),outputs('large'));
      assert.equal(counts.image-before,1);
      const corrupt = path.join(directory,'corrupt.jpg'); await fs.writeFile(corrupt,'invalid');
      await assert.rejects(image.generateImageThumbnails(file(corrupt),outputs('bad-image')));
      const corruptVideo = path.join(directory,'corrupt.mp4'); await fs.writeFile(corruptVideo,'invalid mp4');
      await assert.rejects(video.generateVideoThumbnails(file(corruptVideo),outputs('bad-video')));
      await assert.rejects(video.extractVideoMetadata(file(corruptVideo)));
      await assert.rejects(video.generateVideoThumbnails(file(tagged),new Map()));
    });
    await check('shutdown prevents new commands and image variants',async()=>{
      process.env.HMV_SHUTTING_DOWN='1';
      try {
        await assert.rejects(video.generateVideoThumbnails(file(tagged),outputs('shutdown')));
        await assert.rejects(image.generateImageThumbnails(file(photo),outputs('shutdown-image')));
      } finally { delete process.env.HMV_SHUTTING_DOWN; }
    });
    await check('subprocess timeout, buffer bounds and signal cancellation remain active',async()=>{
      const exec = cp.execFile;
      try {
        cp.execFile = function (executable,args,options,callback) {
          assert.equal(options.timeout,30000); assert.equal(options.maxBuffer,4*1024*1024);
          assert.equal(options.killSignal,'SIGKILL');
          return exec.call(this,executable,args,{...options,timeout:50},callback);
        };
        await assert.rejects(command('/bin/sleep',['5']));
      } finally { cp.execFile = exec; }
      const before = process.listenerCount('SIGTERM');
      const running = command('/bin/sleep',['5']);
      // Invoke the command's signal handler without marking the entire test worker shutting down.
      const stop = process.listeners('SIGTERM').at(-1); stop();
      await assert.rejects(running);
      assert.equal(process.listenerCount('SIGTERM'),before);
    });
    console.log(JSON.stringify({passed:true,checks,counts,peakRssKiB:process.resourceUsage().maxRSS}));
  } finally { await fs.rm(directory,{recursive:true,force:true}); }
}
main().catch(error=>{console.error(error);process.exitCode=1});
