const { spawn, spawnSync, exec } = require('child_process');
const http = require('http');
const path = require('path');

const ROOT = __dirname;
const BACKEND_DIR = path.join(ROOT, 'backend');
const FRONTEND_DIR = path.join(ROOT, 'frontend');
const BACKEND_URL = 'http://localhost:5000/api';
const FRONTEND_URL = 'http://localhost:8000';

let backendProcess;
let frontendProcess;
let stopped = false;

function log(message) {
  console.log(`[launcher] ${message}`);
}

function commandExists(cmd, args = ['--version']) {
  const result = spawnSync(cmd, args, { stdio: 'ignore', shell: true });
  return result.status === 0;
}

function waitForUrl(url, timeoutMs = 45000) {
  const start = Date.now();

  return new Promise((resolve) => {
    const tryRequest = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode >= 200 && res.statusCode < 500) {
          resolve(true);
          return;
        }

        if (Date.now() - start >= timeoutMs) {
          resolve(false);
          return;
        }

        setTimeout(tryRequest, 500);
      });

      req.on('error', () => {
        if (Date.now() - start >= timeoutMs) {
          resolve(false);
          return;
        }

        setTimeout(tryRequest, 500);
      });

      req.setTimeout(2000, () => {
        req.destroy();
      });
    };

    tryRequest();
  });
}

function openBrowser(url) {
  const platform = process.platform;

  if (platform === 'win32') {
    exec(`start "" "${url}"`);
    return;
  }

  if (platform === 'darwin') {
    exec(`open "${url}"`);
    return;
  }

  exec(`xdg-open "${url}"`);
}

function killProcessTree(proc) {
  if (!proc || proc.killed) {
    return;
  }

  if (process.platform === 'win32') {
    exec(`taskkill /PID ${proc.pid} /T /F`, () => {});
  } else {
    proc.kill('SIGTERM');
  }
}

function stopAll() {
  if (stopped) {
    return;
  }

  stopped = true;
  log('Deteniendo servicios...');
  killProcessTree(backendProcess);
  killProcessTree(frontendProcess);

  setTimeout(() => process.exit(0), 300);
}

function startBackend() {
  log('Iniciando backend (puerto 5000)...');
  backendProcess = spawn('npm', ['start'], {
    cwd: BACKEND_DIR,
    stdio: 'inherit',
    shell: true,
  });

  backendProcess.on('exit', (code) => {
    if (stopped) {
      return;
    }

    log(`Backend finalizo con codigo ${code}.`);
    stopAll();
  });
}

function startFrontend() {
  log('Iniciando frontend (puerto 8000)...');

  if (commandExists('python')) {
    frontendProcess = spawn('python', ['-m', 'http.server', '8000'], {
      cwd: FRONTEND_DIR,
      stdio: 'inherit',
      shell: true,
    });
  } else if (commandExists('python3')) {
    frontendProcess = spawn('python3', ['-m', 'http.server', '8000'], {
      cwd: FRONTEND_DIR,
      stdio: 'inherit',
      shell: true,
    });
  } else {
    frontendProcess = spawn('npx', ['http-server', '-p', '8000'], {
      cwd: FRONTEND_DIR,
      stdio: 'inherit',
      shell: true,
    });
  }

  frontendProcess.on('exit', (code) => {
    if (stopped) {
      return;
    }

    log(`Frontend finalizo con codigo ${code}.`);
    stopAll();
  });
}

async function main() {
  startBackend();
  startFrontend();

  const [backendOk, frontendOk] = await Promise.all([
    waitForUrl(BACKEND_URL),
    waitForUrl(FRONTEND_URL),
  ]);

  if (backendOk && frontendOk) {
    log(`Backend listo: ${BACKEND_URL}`);
    log(`Frontend listo: ${FRONTEND_URL}`);
    log('Abriendo navegador...');
    openBrowser(FRONTEND_URL);
    log('Para detener ambos servicios: Ctrl + C');
  } else {
    log('No se pudo verificar uno de los servicios a tiempo. Revisa la salida anterior.');
  }
}

process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);

main().catch((err) => {
  console.error('[launcher] Error al iniciar:', err.message);
  stopAll();
});
