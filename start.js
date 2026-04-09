const { exec, spawn } = require('child_process');
const path = require('path');

// Función para matar procesos en puerto 5000
function killPort5000() {
  return new Promise((resolve) => {
    exec('netstat -ano | findstr :5000', (error, stdout) => {
      if (stdout) {
        const lines = stdout.split('\n');
        lines.forEach(line => {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 5) {
            const pid = parts[4];
            if (pid && pid !== '0') {
              console.log(`Terminando proceso ${pid} en puerto 5000...`);
              exec(`taskkill /PID ${pid} /F`, () => {});
            }
          }
        });
      }
      setTimeout(resolve, 2000); // Esperar 2s para que se libere
    });
  });
}

// Función para iniciar backend
function startBackend() {
  return new Promise((resolve, reject) => {
    const backendPath = path.join(__dirname, 'backend');
    console.log('Iniciando backend en', backendPath);

    const npm = spawn('npm', ['run', 'dev'], {
      cwd: backendPath,
      stdio: 'inherit',
      shell: true
    });

    npm.on('error', reject);

    // Esperar un poco para que arranque
    setTimeout(() => {
      console.log('Backend iniciado, esperando conexión...');
      resolve();
    }, 5000);
  });
}

// Función para abrir navegador
function openBrowser() {
  console.log('Abriendo Brave en http://localhost:5000/');
  exec('start brave http://localhost:5000/', (error) => {
    if (error) {
      console.log('No se pudo abrir Brave automáticamente. Abre manualmente: http://localhost:5000/');
    }
  });
}

// Función principal
async function main() {
  try {
    console.log('🚀 Iniciando sistema Eventos+...');

    await killPort5000();
    await startBackend();
    openBrowser();

    console.log('✅ Sistema listo. Mantén esta terminal abierta.');
  } catch (error) {
    console.error('❌ Error al iniciar:', error.message);
    process.exit(1);
  }
}

main();