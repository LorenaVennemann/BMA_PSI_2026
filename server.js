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

app.get('/api/led', (req, res) => res.json({ led: ledState }));

app.post('/api/photo', (req, res) => {
  const { shutter = '', gain = '', ev = '0' } = req.body || {};
  const name = `foto_${Date.now()}.raw`;
  const filePath = path.join(PHOTO_DIR, name);
  const args = ['-o', filePath, '-t', '1000', '--nopreview', '--ev', String(ev), '--raw', '--hflip', '--awbgains', '2.8,1.2'];
  if (shutter) args.push('--shutter', String(shutter));
  if (gain) args.push('--gain', String(gain));

  execFile('rpicam-still', args, err => {
    if (err) return res.status(500).json({ error: err.message });

    const calibFile = path.join(__dirname, 'calibration.npz');
    if (fs.existsSync(calibFile)) {
      execFile('python3', [path.join(__dirname, 'undistort.py'), filePath, filePath], err2 => {
        if (err2) console.error('Undistort:', err2.message);
        res.json({ url: `/photos/${name}` });
      });
    } else {
      res.json({ url: `/photos/${name}` });
    }
  });
});

app.post('/api/analyze', (req, res) => {
  const files = fs.readdirSync(PHOTO_DIR)
    .filter(f => f.endsWith('.raw'))
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

process.on('SIGINT', () => {
  led.stdin.write('off\n');
  setTimeout(() => process.exit(), 300);
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server laut auf Port ${PORT}`));
