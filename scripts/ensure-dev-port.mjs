/**
 * Frees port 5173 if a stale Vite/node dev server is still running.
 * Prevents "Port 5173 is already in use" when restarting npm run dev or desktop:dev.
 */
import { execSync } from 'child_process';

const PORT = 5173;

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

try {
  const pids = run(`lsof -ti:${PORT}`);
  if (!pids) process.exit(0);

  for (const pid of pids.split('\n').filter(Boolean)) {
    try {
      const args = run(`ps -p ${pid} -o args=`).toLowerCase();
      const isDevServer =
        args.includes('vite') ||
        (args.includes('node') && (args.includes('kaiwriter') || args.includes('5173')));
      if (!isDevServer) continue;

      console.log(`Stopping stale dev server on port ${PORT} (pid ${pid})…`);
      execSync(`kill ${pid}`);
    } catch {
      // process already exited
    }
  }
} catch {
  // port is free
}
