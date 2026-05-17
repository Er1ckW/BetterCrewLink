const fs = require('fs');
const path = require('path');

// Generate some dummy files to simulate game executables
const testDir = path.join(__dirname, 'test_exe_dir');
if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir);
}
const numFiles = 1000;
const exeFiles: string[] = [];

for (let i = 0; i < numFiles; i++) {
  const filePath = path.join(testDir, `game_${i}.exe`);
  fs.writeFileSync(filePath, 'dummy content');
  exeFiles.push(`game_${i}.exe`);
}

// Simulate custom platforms
const customPlatforms: Record<string, any> = {};
for (let i = 0; i < numFiles; i++) {
  customPlatforms[`Platform_${i}`] = {
    launchType: 'exe',
    runPath: testDir,
    execute: [exeFiles[i]]
  };
}

// 1. Benchmark Synchronous Access (Baseline)
function benchmarkSync() {
  const availableGamePlatforms: any = {};
  const start = process.hrtime.bigint();

  for (const key in customPlatforms) {
    const game_platform = customPlatforms[key];
    if (game_platform.launchType === 'exe') {
      try {
        fs.accessSync(path.join(game_platform.runPath, game_platform.execute[0]), fs.constants.X_OK);
        availableGamePlatforms[key] = game_platform;
      } catch {
        continue;
      }
    }
  }

  const end = process.hrtime.bigint();
  console.log(`Synchronous Baseline: ${Number(end - start) / 1e6} ms`);
}

// 2. Benchmark Asynchronous Access (Sequential Await)
async function benchmarkAsyncSequential() {
  const availableGamePlatforms: any = {};
  const start = process.hrtime.bigint();

  for (const key in customPlatforms) {
    const game_platform = customPlatforms[key];
    if (game_platform.launchType === 'exe') {
      try {
        await fs.promises.access(path.join(game_platform.runPath, game_platform.execute[0]), fs.constants.X_OK);
        availableGamePlatforms[key] = game_platform;
      } catch {
        continue;
      }
    }
  }

  const end = process.hrtime.bigint();
  console.log(`Asynchronous Sequential: ${Number(end - start) / 1e6} ms`);
}

// 3. Benchmark Asynchronous Access (Concurrent Promise.all)
async function benchmarkAsyncConcurrent() {
  const availableGamePlatforms: any = {};
  const start = process.hrtime.bigint();

  const promises = Object.keys(customPlatforms).map(async (key) => {
    const game_platform = customPlatforms[key];
    if (game_platform.launchType === 'exe') {
      try {
        await fs.promises.access(path.join(game_platform.runPath, game_platform.execute[0]), fs.constants.X_OK);
        availableGamePlatforms[key] = game_platform;
      } catch {
        // continue
      }
    }
  });

  await Promise.all(promises);

  const end = process.hrtime.bigint();
  console.log(`Asynchronous Concurrent: ${Number(end - start) / 1e6} ms`);
}

async function run() {
  console.log('Running Benchmarks...');
  // Warmup
  benchmarkSync();
  console.log('---');
  benchmarkSync();
  await benchmarkAsyncSequential();
  await benchmarkAsyncConcurrent();

  // Cleanup
  for (let i = 0; i < numFiles; i++) {
    fs.unlinkSync(path.join(testDir, exeFiles[i]));
  }
  fs.rmdirSync(testDir);
}

run();
