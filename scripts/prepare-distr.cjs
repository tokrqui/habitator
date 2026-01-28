const fs = require('fs').promises;
const path = require('path');

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function copyFile(src, dest) {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest);
}

async function copyDir(src, dest) {
  const entries = await fs.readdir(src, { withFileTypes: true });
  await fs.mkdir(dest, { recursive: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      await copyFile(srcPath, destPath);
    }
  }
}

async function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const distr = path.join(repoRoot, 'distr');

  const files = ['manifest.json', 'styles.css', 'README.md'];
  const folders = ['assets', 'dist'];

  try {
    for (const f of files) {
      const src = path.join(repoRoot, f);
      if (await exists(src)) {
        await copyFile(src, path.join(distr, f));
        console.log(`Copied ${f} to distr/`);
      } else {
        console.log(`Skipping ${f} (not found)`);
      }
    }

    for (const d of folders) {
      const srcDir = path.join(repoRoot, d);
      if (await exists(srcDir)) {
        await copyDir(srcDir, path.join(distr, d));
        console.log(`Copied folder ${d} to distr/`);
      } else {
        console.log(`Skipping folder ${d} (not found)`);
      }
    }

    console.log('prepare-distr complete');
    process.exit(0);
  } catch (err) {
    console.error('prepare-distr failed:', err);
    process.exit(1);
  }
}

main();
