import {observingTime, timingTerms, formatSeconds, formatDuration} from './efficiency.js';

const mathjaxUrl = 'https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-svg.js';

const definitions = {
    original: {
        readsPerCoadd: String.raw`2 \text{ CDS},\ N \text{ MCDS}`,
        transfer: '0',
        dead: String.raw`3.05\,\text{s} + 4.65\,\mu\text{s}\,XY`,
        moves: String.raw`D + 1 \text{ (0 if } D{=}1\text{; } D \text{ if } D{=}5, 9\text{)}`,
        move: String.raw`6\,\text{s}`
    },
    updated: {
        readsPerCoadd: String.raw`1 \text{ CDS},\ N \text{ MCDS}`,
        transfer: String.raw`52\,\text{ns}\,XY`,
        dead: String.raw`4.0\,\text{s} + 0.28\,\mu\text{s}\,XY`,
        moves: String.raw`D + 1 \text{ (0 if } D{=}1\text{)}`,
        move: String.raw`25\,\text{s typical},\ 9\,\text{s fast}`
    }
};

const value = text => String.raw`\text{${text}}`;
let mathjax;
let queue = Promise.resolve();

// MathJax is about 2 MB, so it loads the first time the equation is opened.
function loadMathJax() {
    mathjax ??= new Promise((resolve, reject) => {
        window.MathJax = {startup: {typeset: false}, svg: {fontCache: 'global'}};
        const script = document.createElement('script');
        script.src = mathjaxUrl;
        script.onload = () => window.MathJax.startup.promise.then(resolve);
        script.onerror = reject;
        document.head.append(script);
    });
    return mathjax;
}

function tex(settings) {
    const time = observingTime(settings);
    const terms = timingTerms(settings);
    const model = definitions[settings.model];
    return [
        String.raw`\[\begin{aligned}
            t_\text{coadd} &= t + P\,(t_\text{read} + t_\text{xfer}) &&= ${value(formatDuration(time.coaddSeconds))} \\
            t_\text{frame} &= C\,t_\text{coadd} + t_\text{dead} &&= ${value(formatDuration(time.frameSeconds))} \\
            T &= D R\,t_\text{frame} + M\,t_\text{move} &&= ${value(formatDuration(time.elapsed))} \\
            \eta &= D R C\,t\,/\,T &&= ${time.efficiency.toFixed(1)}\%
        \end{aligned}\]`,
        String.raw`\[\begin{aligned}
            P &= ${model.readsPerCoadd} &&= ${terms.readsPerCoadd} \\
            t_\text{read} &= \text{one read of } X \times Y &&= ${value(formatSeconds(terms.readSeconds))} \\
            t_\text{xfer} &= ${model.transfer} &&= ${value(formatSeconds(terms.transferSeconds))} \\
            t_\text{dead} &= ${model.dead} &&= ${value(formatSeconds(terms.deadSeconds))} \\
            M &= ${model.moves} &&= ${terms.moves} \\
            t_\text{move} &= ${model.move} &&= ${value(formatSeconds(terms.moveSeconds))}
        \end{aligned}\]`
    ];
}

function typeset(container) {
    const blocks = [...container.querySelectorAll('[data-tex]')];
    if (!container.open || blocks.every(block => block.dataset.rendered === block.dataset.tex)) return;
    queue = queue.then(loadMathJax).then(() => {
        window.MathJax.typesetClear(blocks);
        for (const block of blocks) block.textContent = block.dataset.rendered = block.dataset.tex;
        return window.MathJax.typesetPromise(blocks);
    }).catch(() => {
        for (const block of blocks) block.textContent = block.dataset.tex;
    });
}

export function renderEquation(container, settings) {
    const blocks = container.querySelectorAll('[data-tex]');
    tex(settings).forEach((text, i) => blocks[i].dataset.tex = text);
    container.ontoggle = () => typeset(container);
    typeset(container);
}
