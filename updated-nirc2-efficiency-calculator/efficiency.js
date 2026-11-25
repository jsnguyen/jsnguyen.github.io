// Y that "subc N" picks for each X, from the observer's manual Table 5.7.
export const subcPresets = {1024: 1024, 768: 776, 512: 512, 256: 264, 128: 152, 64: 56};

// Time to read the subarray once at the 200 kHz sample rate, from the original calculator.
// It matches the manual's Table 5.7 and the readout measured in Archon-era frame headers.
function readSeconds(x, y) {
    const sampleRateKHz = 200;
    const rows = y + 8;
    const pauses = 5000 / sampleRateKHz - 8;
    const nanoseconds = 240 * (1324 - rows) + 25 * rows * (pauses * (8 + x / 4) + 864 + 1.25 * x);
    return 1.06001 * nanoseconds / 1e9;
}

const models = {
    // Keck NIRC2 SNR and Efficiency Calculator, from before the November 2023 Archon upgrade.
    // https://www2.keck.hawaii.edu/inst/nirc2/nirc2_snr_eff.html
    // Its extra 15 s per LGS dither move is ignored, since LGS dithers no longer carry that penalty.
    // It counts one fewer move for 5 and 9 dithers without saying why.
    original: {
        readsPerCoadd: reads => reads,
        transferSeconds: () => 0,
        deadSeconds: (x, y) => 3.05 + 4.65e-6 * x * y,
        moveSeconds: () => 6,
        aoMoves: dithers => dithers === 1 ? 0 : dithers === 5 || dithers === 9 ? dithers : dithers + 1
    },
    // Fit to NIRC2 frame headers taken after the Archon upgrade: one read time per CDS coadd, N per MCDS coadd
    // with N read pairs (2N reads), 26 ns per pixel per read after the exposure, the dead time between
    // back-to-back frames, and dither moves of 25 s typically or 9 s for fast scripted dithers (NGS and LGS
    // alike). The number of moves follows the observer's manual section 2.4, except that a single position
    // needs no move.
    updated: {
        readsPerCoadd: reads => reads > 2 ? reads : 1,
        transferSeconds: (x, y) => 52e-9 * x * y,
        deadSeconds: (x, y) => 4.0 + 0.28e-6 * x * y,
        moveSeconds: speed => speed === 'fast' ? 9 : 25,
        aoMoves: dithers => dithers === 1 ? 0 : dithers + 1
    }
};

// Legal subarrays have X a multiple of 32, Y a multiple of 8, and X × (Y + 8) a multiple of 4096.
export function legalHeights(x) {
    if (x % 32 || x < 32 || x > 1024) return [];
    return Array.from({length: 128}, (_, i) => 8 * (i + 1)).filter(y => x * (y + 8) % 4096 === 0);
}

export function minimumTint({x, y, reads}) {
    return Math.max(readSeconds(x, y) * (reads > 2 ? reads : 1), 0.0025);
}

export function timingTerms({model, reads, dithers, x, y, moveSpeed}) {
    const m = models[model];
    const terms = {
        readsPerCoadd: m.readsPerCoadd(reads), readSeconds: minimumTint({x, y, reads: 2}), transferSeconds: m.transferSeconds(x, y),
        deadSeconds: m.deadSeconds(x, y), moves: m.aoMoves(dithers), moveSeconds: m.moveSeconds(moveSpeed)
    };
    terms.coaddOverhead = terms.readsPerCoadd * (terms.readSeconds + terms.transferSeconds);
    return terms;
}

// Efficiency as a fast function of tint and coadds, for drawing maps.
export function efficiencyMap(settings) {
    const terms = timingTerms(settings);
    const frames = settings.dithers * settings.repeats;
    const aoOverhead = terms.moves * terms.moveSeconds;
    return (tint, coadds) => 100 * frames * coadds * tint / (aoOverhead + frames * (coadds * (tint + terms.coaddOverhead) + terms.deadSeconds));
}

export function observingTime(settings) {
    const {tint, coadds, dithers, repeats} = settings;
    const terms = timingTerms(settings);
    const coaddSeconds = tint + terms.coaddOverhead;
    const frameSeconds = coadds * coaddSeconds + terms.deadSeconds;
    const aoOverhead = terms.moves * terms.moveSeconds;
    const integration = dithers * repeats * coadds * tint;
    const elapsed = aoOverhead + dithers * repeats * frameSeconds;
    return {coaddSeconds, frameSeconds, integration, elapsed, aoOverhead, nirc2Overhead: elapsed - aoOverhead - integration, efficiency: 100 * integration / elapsed};
}

export function formatSeconds(seconds) {
    return Number(seconds.toPrecision(3)) + ' s';
}

export function formatDuration(seconds) {
    if (seconds < 100) return seconds.toFixed(1) + ' s';
    if (seconds < 6000) return (seconds / 60).toFixed(1) + ' min';
    return (seconds / 3600).toFixed(2) + ' h';
}
