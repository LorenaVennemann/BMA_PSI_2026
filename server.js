const express = require('express');
const { spawn, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;
const PHOTO_DIR = path.join(__dirname, 'photos');
const ANALYSIS_DIR = path.join(__dirname, 'public', 'analysis');
const ALIGN_DIR = '/home/pi/visual0/tepxCheckHDI';
fs.mkdirSync(PHOTO_DIR, { recursive: true });
fs.mkdirSync(ANALYSIS_DIR, { recursive: true });

const led = spawn('/usr/bin/python3', [path.join(__dirname, 'led.py')]);
led.stderr.on('data', d => console.error('LED:', d.toString()));
let ledState = 'off';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/photos', express.static(PHOTO_DIR));

app.post('/api/led/on', (req, res) => {
  const { r = 255, g = 255, b = 255 } = req.body || {};
  led.stdin.write(`on ${r} ${g} ${b}\n`);
  ledState = 'on';
  res.json({ led: ledState });
});

app.post('/api/led/off', (req, res) => {
  led.stdin.write('off\n');
  ledState = 'off';
  res.json({ led: ledState });
});

app.post('/api/led/bright', (req, res) => {
  const { value = 150 } = req.body || {};
  const v = Math.max(0, Math.min(255, parseInt(value)));
  led.stdin.write(`bright ${v}\n`);
  res.json({ brightness: v });
});

app.get('/api/led', (req, res) => res.json({ led: ledState }));

app.post('/api/photo', (req, res) => {
  const { shutter = '', gain = '', ev = '0' } = req.body || {};
  const name = `foto_${Date.now()}.jpg`;
  const filePath = path.join(PHOTO_DIR, name);
  const args = ['-o', filePath, '-t', '1000', '--nopreview', '--ev', String(ev), '--raw', '--hflip', '--awbgains', '2.8,1.2'];
  if (shutter) args.push('--shutter', String(shutter));
  if (gain) args.push('--gain', String(gain));

  execFile('rpicam-still', args, err => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ url: `/photos/${name}` });
  });
});

app.post('/api/analyze', (req, res) => {
  const files = fs.readdirSync(PHOTO_DIR)
    .filter(f => f.endsWith('.jpg'))
    .map(f => ({ f, t: fs.statSync(path.join(PHOTO_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  if (files.length === 0) return res.status(400).json({ error: 'no photo found yet' });

  const latest = path.join(PHOTO_DIR, files[0].f);
  execFile(path.join(ALIGN_DIR, '.venv', 'bin', 'python3'), [
    'check_alignment.py', latest,
    '--out', ANALYSIS_DIR,
    '--quiet', '--json', '--no-log'
  ], { cwd: ALIGN_DIR }, (err, stdout, stderr) => {
    if (err) return res.status(500).json({ error: stderr || err.message });
    let data;
    try { data = JSON.parse(stdout)[0]; } catch (e) { return res.status(500).json({ error: 'bad output: ' + stdout }); }
    const stem = path.basename(latest, path.extname(latest));
    res.json({ result: data, overlay: `/analysis/${stem}_overlay.jpg` });
  });
});

let streamProc = null;

app.get('/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
    'Cache-Control': 'no-cache',
    'Connection': 'close'
  });

  const cam = spawn('rpicam-vid', [
    '-t', '0',
    '--codec', 'mjpeg',
    '--width', '1280',
    '--height', '720',
    '--framerate', '15',
    '--awbgains', '2.8,1.2',
    '--nopreview',
    '-o', '-'
  ]);
  streamProc = cam;

  let buffer = Buffer.alloc(0);
  cam.stdout.on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    let start = buffer.indexOf(Buffer.from([0xFF, 0xD8]));
    let end = buffer.indexOf(Buffer.from([0xFF, 0xD9]));
    while (start !== -1 && end !== -1 && end > start) {
      const frame = buffer.slice(start, end + 2);
      res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`);
      res.write(frame);
      res.write('\r\n');
      buffer = buffer.slice(end + 2);
      start = buffer.indexOf(Buffer.from([0xFF, 0xD8]));
      end = buffer.indexOf(Buffer.from([0xFF, 0xD9]));
    }
  });

  req.on('close', () => {
    cam.kill('SIGTERM');
    streamProc = null;
  });
});

process.on('SIGINT', () => {
  led.stdin.write('off\n');
  setTimeout(() => process.exit(), 300);
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server laut auf Port ${PORT}`));
