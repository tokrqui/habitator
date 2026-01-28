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
  const defaultVault = 'F:/projects/obsidian-group/_test-vault';
  const vaultPathArg = process.argv[2] || defaultVault;
  const vaultPath = path.resolve(vaultPathArg);

  const repoRoot = path.resolve(__dirname, '..');
  const pkg = require(path.join(repoRoot, 'package.json'));
  const pluginFolderName = pkg.name || 'habitator';

  const dest = path.join(vaultPath, '.obsidian', 'plugins', pluginFolderName);

  console.log(`Deploying plugin to: ${dest}`);

  // Files and folders to copy if present
  const files = ['manifest.json', 'styles.css', 'README.md'];
  const folders = ['assets', 'dist'];

  // Prefer a dedicated distributable directory (distr/) if it exists
  const distrDir = path.join(repoRoot, 'distr');
  const useDistr = await exists(distrDir);

  try {
    await fs.mkdir(dest, { recursive: true });

    if (useDistr) {
      console.log('Found distr/ folder — deploying its contents');
      await copyDir(distrDir, dest);
      console.log('Copied distr/ -> plugin folder');

      // Also copy manifest.json from repo root if present
      const manifestSrc = path.join(repoRoot, 'manifest.json');
      if (await exists(manifestSrc)) {
        await copyFile(manifestSrc, path.join(dest, 'manifest.json'));
        console.log('Copied manifest.json');
      }
    } else {
      for (const f of files) {
        const src = path.join(repoRoot, f);
        if (await exists(src)) {
          await copyFile(src, path.join(dest, f));
          console.log(`Copied ${f}`);
        } else {
          console.log(`Skipping ${f} (not found)`);
        }
      }

      for (const d of folders) {
        const srcDir = path.join(repoRoot, d);
        if (await exists(srcDir)) {
          await copyDir(srcDir, path.join(dest, d));
          console.log(`Copied folder ${d}`);
        } else {
          console.log(`Skipping folder ${d} (not found)`);
        }
      }
    }

    console.log('Deploy complete.');
    process.exit(0);
  } catch (err) {
    console.error('Deploy failed:', err);
    process.exit(1);
  }
}

main();
