// Record the observed emulator window only. No desktop or audio input.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as pause } from 'node:timers/promises';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.env.MIST_RECORDING_DIR ? path.resolve(process.env.MIST_RECORDING_DIR) : path.join(root, 'evidence', 'recording-20261120');
fs.mkdirSync(out, { recursive: true });
const file = path.join(out, 'MistArchive-v2-emulator-20261120.mp4');
if (fs.existsSync(file)) throw new Error('Recording exists; preserve it and choose another output directory.');
const args = ['-hide_banner', '-f', 'lavfi', '-i',
  'gfxcapture=window_title=^Emulator$:max_framerate=20:capture_cursor=0',
  '-vf', 'hwdownload,format=bgra,crop=364:792:0:0,format=yuv420p',
  '-c:v', 'libx264', '-threads', '2', '-preset', 'veryfast', '-crf', '22',
  '-movflags', '+faststart', '-n', file];
const encoder = spawn('ffmpeg', args, { cwd: root, windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
let encodingLog = '';
encoder.stderr.on('data', b => { encodingLog += b; });
const finishedEncoding = new Promise(resolve => encoder.on('exit', resolve));
const startedAt = new Date().toISOString();
await pause(3000);
const test = spawn(process.execPath, ['scripts/test-native-ui.mjs', '--recording', '--reset-first'], {
  cwd: root, windowsHide: true, env: { ...process.env, MIST_EVIDENCE_DIR: out }, stdio: ['ignore', 'pipe', 'pipe']
});
let testLog = '';
for (const stream of [test.stdout, test.stderr]) stream.on('data', b => { testLog += b; process.stdout.write(b); });
const code = await new Promise(resolve => test.on('exit', resolve));
await pause(2500);
encoder.stdin.write('q\n');
const encoderCode = await finishedEncoding;
fs.writeFileSync(path.join(out, 'native-ui.log'), testLog);
fs.writeFileSync(path.join(out, 'capture.log'), encodingLog);
const probe = JSON.parse(execFileSync('ffprobe', ['-v','error','-show_format','-show_streams','-of','json',file], { encoding:'utf8', windowsHide:true }));
fs.writeFileSync(path.join(out, 'recording.json'), JSON.stringify({ startedAt, completedAt:new Date().toISOString(),
  file:path.basename(file), source:'Continuous Windows Graphics Capture of Emulator window; fixed crop excludes side toolbar; no desktop or audio capture',
  args, testExitCode:code, encoderExitCode:encoderCode, probe }, null, 2));
if (code || encoderCode) process.exitCode = 1;
