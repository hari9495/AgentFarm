import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';

const usage = () => {
    process.stderr.write(
        'Usage: node coverage-threshold-check.mjs <summaryPath> <threshold> <metric> <file1> [file2 ...]\n',
    );
};

const [summaryPathArg, thresholdArg, metricArg, ...fileArgs] = process.argv.slice(2);

if (!summaryPathArg || !thresholdArg || !metricArg || fileArgs.length === 0) {
    usage();
    process.exitCode = 1;
} else {
    const summaryPath = resolve(process.cwd(), summaryPathArg);
    const threshold = Number(thresholdArg);
    const metric = metricArg;

    if (!Number.isFinite(threshold)) {
        process.stderr.write(`Invalid threshold '${thresholdArg}'.\n`);
        process.exit(1);
    }

    const summaryRaw = await readFile(summaryPath, 'utf8');
    const summary = JSON.parse(summaryRaw);

    const normalize = (value) => value.replace(/\\/g, '/').toLowerCase();

    let hasFailure = false;
    process.stdout.write(`Coverage threshold check: metric=${metric}, threshold=${threshold}%\n`);

    for (const fileArg of fileArgs) {
        const expectedFile = normalize(resolve(process.cwd(), fileArg));
        const entry = Object.entries(summary).find(([key]) => normalize(key) === expectedFile);

        if (!entry) {
            hasFailure = true;
            process.stderr.write(`- FAIL ${fileArg}: no coverage entry found\n`);
            continue;
        }

        const [, data] = entry;
        const metricData = data?.[metric];
        const pct = metricData?.pct;

        if (!Number.isFinite(pct)) {
            hasFailure = true;
            process.stderr.write(`- FAIL ${fileArg}: metric '${metric}' missing\n`);
            continue;
        }

        if (pct < threshold) {
            hasFailure = true;
            process.stderr.write(`- FAIL ${fileArg}: ${pct}% < ${threshold}%\n`);
            continue;
        }

        process.stdout.write(`- PASS ${fileArg}: ${pct}%\n`);
    }

    if (hasFailure) {
        process.exitCode = 1;
    }
}
