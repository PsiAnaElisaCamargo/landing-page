(() => {
  'use strict';

  const main = document.querySelector('main');
  const header = document.querySelector('.site-header');
  const symbol = header?.querySelector('.brand-symbol');
  const closing = document.querySelector('.thought-closing');
  const drawing = closing?.querySelector('.thought-drawing');
  const pauseButton = document.querySelector('.thread-pause');
  if (!main || !symbol || !drawing || !pauseButton) return;

  const ns = 'http://www.w3.org/2000/svg';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const sections = [...main.querySelectorAll(':scope > section')];
  let paused = false;
  let layoutFrame = 0;
  let scrollFrame = 0;
  let segments = [];
  let loops = [];
  let lane = 0;
  let inside = 0;
  let pageWidth = 0;
  let closingTop = 0;
  let ending = '';
  let endingBottom = 0;

  function element(tag, attributes, parent) {
    const node = document.createElementNS(ns, tag);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
    parent.append(node);
    return node;
  }

  // A single fixed SVG paints the sticky origin and scrolling continuation
  // in the same frame, so native scrolling cannot pull them apart.
  const canvas = element('svg', {
    class: 'story-thread', 'aria-hidden': 'true', focusable: 'false',
    preserveAspectRatio: 'none'
  }, document.body);
  const defs = element('defs', {}, canvas);
  const gradient = element('linearGradient', {
    id: 'thread-ink', gradientUnits: 'userSpaceOnUse', x1: 0, x2: 0, y1: 0
  }, defs);
  const colorStops = Array.from({ length: 4 }, () => element('stop', {}, gradient));
  const clip = element('clipPath', { id: 'thread-answer-clip', clipPathUnits: 'userSpaceOnUse' }, defs);
  const clipRect = element('rect', { x: 0, width: '100%' }, clip);
  const right = element('path', {
    class: 'thread-answer', stroke: 'url(#thread-ink)', 'clip-path': 'url(#thread-answer-clip)'
  }, canvas);
  const left = element('path', { class: 'thread-line', stroke: 'url(#thread-ink)', 'clip-path': 'url(#thread-answer-clip)' }, canvas);
  const loopGroup = element('g', { 'clip-path': 'url(#thread-answer-clip)' }, canvas);
  const traveler = element('path', { class: 'thread-traveler', stroke: 'url(#thread-ink)', 'clip-path': 'url(#thread-answer-clip)' }, canvas);
  const origin = element('path', { class: 'thread-line', stroke: '#a85f43' }, canvas);
  const edgeGradient = element('linearGradient', {
    id: 'thread-edge-fade', gradientUnits: 'userSpaceOnUse', x1: 0, x2: 0
  }, defs);
  const edgeStart = element('stop', { offset: 0, 'stop-color': 'white' }, edgeGradient);
  element('stop', { offset: 1, 'stop-color': 'white' }, edgeGradient);
  const edgeMask = element('mask', { id: 'thread-edge-mask', maskUnits: 'userSpaceOnUse', x: 0 }, defs);
  const edgeRect = element('rect', { x: 0, fill: 'url(#thread-edge-fade)' }, edgeMask);
  [left, right, traveler].forEach(path => path.setAttribute('mask', 'url(#thread-edge-mask)'));

  const docTop = node => node.getBoundingClientRect().top + window.scrollY;
  const point = (x, y) => `${x.toFixed(2)} ${y.toFixed(2)}`;
  const curve = (x1, y1, x2, y2, x3, y3) => `C${point(x1, y1)} ${point(x2, y2)} ${point(x3, y3)}`;

  function addSegment(x0, y0, x1, x2, x3, y3) {
    segments.push({ x0, y0, x1, x2, x3, y3 });
  }

  function render() {
    scrollFrame = 0;
    if (!segments.length) return;
    const scrollY = window.scrollY;
    const headerBox = header.getBoundingClientRect();
    const iconBox = symbol.getBoundingClientRect();
    const startX = iconBox.left + iconBox.width * .03365;
    const startY = scrollY + iconBox.top + iconBox.height * .29628;
    const headerBottom = scrollY + headerBox.bottom;
    const arrival = Math.max(0, Math.min(1, (closingTop - headerBottom - 70) / 180));
    origin.style.opacity = arrival;
    edgeStart.setAttribute('stop-opacity', arrival);
    edgeGradient.setAttribute('y1', headerBottom);
    edgeGradient.setAttribute('y2', headerBottom + 70);
    [edgeMask, edgeRect].forEach(node => {
      node.setAttribute('y', headerBottom);
      node.setAttribute('width', pageWidth);
      node.setAttribute('height', window.innerHeight);
    });
    const drop = Math.max(220, Math.min(460, window.innerHeight * .55));
    const joinY = Math.min(headerBottom + drop, closingTop);
    loops.forEach(({ node, top }) => {
      // Ease each flourish away before the sticky connection reaches it.
      const progress = Math.max(0, Math.min(1, (top - joinY) / 100));
      node.style.opacity = progress * progress * (3 - 2 * progress);
    });
    const index = segments.findIndex(part => joinY <= part.y3);
    const segmentIndex = index < 0 ? segments.length - 1 : index;
    const part = segments[segmentIndex];
    const t = Math.max(0, Math.min(1, (joinY - part.y0) / (part.y3 - part.y0)));
    const u = 1 - t;
    // Exact cubic subdivision preserves the position and tangent at the join.
    const ax = u * part.x0 + t * part.x1;
    const bx = u * part.x1 + t * part.x2;
    const cx = u * part.x2 + t * part.x3;
    const dx = u * ax + t * bx;
    const ex = u * bx + t * cx;
    const endX = u * dx + t * ex;
    const slope = (3 * u * u * (part.x1 - part.x0)
      + 6 * u * t * (part.x2 - part.x1)
      + 3 * t * t * (part.x3 - part.x2)) / (part.y3 - part.y0);
    const available = Math.max(0, joinY - startY);
    const room = slope > 0 ? endX - 3 : inside - endX;
    const handle = Math.max(0, Math.min(available * .36, Math.max(0, room) / Math.max(.001, Math.abs(slope))));
    // One broad cubic from the symbol to the page, split exactly at the header.
    // No forced vertical leg or independent handles at the navbar boundary.
    const p0 = [startX, startY];
    const p1 = [Math.max(3, startX - Math.min(160, startX * .72)), startY + 12];
    const p2 = [endX - slope * handle, joinY - handle];
    const p3 = [endX, joinY];
    const mix = (a, b, t) => a.map((value, i) => value + (b[i] - value) * t);
    const split = t => {
      const a = mix(p0, p1, t), b = mix(p1, p2, t), c = mix(p2, p3, t);
      const d = mix(a, b, t), e = mix(b, c, t);
      return { a, c, d, e, joint: mix(d, e, t) };
    };
    let low = 0, high = 1;
    for (let i = 0; i < 24; i++) {
      const mid = (low + high) / 2;
      if (split(mid).joint[1] < headerBottom) low = mid;
      else high = mid;
    }
    const bridge = split((low + high) / 2);
    origin.setAttribute('d', `M${point(...p0)}` + curve(...bridge.a, ...bridge.d, ...bridge.joint));
    let d = `M${point(...bridge.joint)}` + curve(...bridge.e, ...bridge.c, ...p3);
    const remainder = part.y3 - joinY;
    d += curve(ex, joinY + remainder / 3, cx, joinY + remainder * 2 / 3, part.x3, part.y3);
    segments.slice(segmentIndex + 1).forEach(segment => {
      const height = segment.y3 - segment.y0;
      d += curve(segment.x1, segment.y0 + height / 3, segment.x2, segment.y0 + height * 2 / 3, segment.x3, segment.y3);
    });
    // At the bottom of short viewports the closing section can already sit
    // behind the header. Keep the origin descending instead of doubling back.
    if (closingTop < headerBottom) {
      d = `M${point(lane, closingTop)}`;
      // Continue behind the header, without rerouting the closing artwork.
      origin.setAttribute('d', `M${point(startX, startY)}`
        + curve(Math.max(3, startX - 70), startY + 5, lane, startY + 14, lane, headerBottom));
    }
    if (endingBottom > headerBottom) d += ending;
    canvas.setAttribute('viewBox', `0 ${scrollY} ${pageWidth} ${window.innerHeight}`);
    left.setAttribute('d', d);
    traveler.setAttribute('d', d);
    clipRect.setAttribute('y', headerBottom);
    clipRect.setAttribute('height', window.innerHeight);

  }

  function draw() {
    layoutFrame = 0;
    pageWidth = document.documentElement.clientWidth;
    const startY = docTop(main);
    // Start turning before the color boundary instead of bending at its edge.
    closingTop = docTop(closing) - Math.min(160, window.innerHeight * .18);
    const containers = [...main.querySelectorAll('.container')];
    const gutter = Math.max(12, Math.min(...containers.map(node => node.getBoundingClientRect().left)) - 7);
    const outside = Math.max(3, Math.min(18, gutter * .12));
    inside = Math.max(outside + 4, gutter - 3);
    lane = outside + (inside - outside) * .48;
    const span = inside - outside;
    segments = [];
    // Sample a flowing wave with shared derivatives instead of stopping at
    // every extremum and restarting a new S-curve at each section boundary.
    const length = closingTop - startY;
    const waveCount = Math.max(1, Math.round(length / 1400));
    const steps = waveCount * 16;
    const omega = Math.PI * 2 * waveCount;
    const wave = t => {
      const phase = omega * t;
      const amplitude = span * (.37 + .045 * Math.sin(Math.PI * 2 * t));
      const amplitudeSlope = span * .045 * Math.PI * 2 * Math.cos(Math.PI * 2 * t);
      const sine = Math.sin(phase);
      return {
        x: lane - amplitude * sine ** 3,
        slope: (-amplitudeSlope * sine ** 3 - 3 * amplitude * sine ** 2 * Math.cos(phase) * omega) / length
      };
    };
    for (let index = 0; index < steps; index++) {
      const t0 = index / steps, t1 = (index + 1) / steps;
      const a = wave(t0), b = wave(t1);
      const height = length / steps;
      addSegment(a.x, startY + length * t0, a.x + a.slope * height / 3,
        b.x - b.slope * height / 3, b.x, startY + length * t1);
    }

    loopGroup.replaceChildren();
    loops = [];
    // Sparse, tilted flourishes touch the wave at its outer turning points.
    // Scale to the empty gutter; omit them where mobile margins are too narrow.
    if (span >= 36) {
      for (let index = 0; index < waveCount; index++) {
        const t = (index + .25) / waveCount;
        const anchor = wave(t);
        const baseY = startY + length * t;
        const width = Math.min(inside - anchor.x - 4, span * (index % 2 ? .64 : .82));
        const height = index % 2 ? 104 : 148;
        const tipX = anchor.x + width;
        const d = `M${point(anchor.x, baseY)}`
          + curve(anchor.x, baseY + height * .40, tipX, baseY - height * .28, tipX, baseY - height * .67)
          + curve(tipX, baseY - height * 1.12, anchor.x, baseY - height * .34, anchor.x, baseY);
        const node = element('path', { class: 'thread-line', stroke: 'url(#thread-ink)', d }, loopGroup);
        loops.push({ node, top: baseY - height });
      }
    }

    const artBox = drawing.getBoundingClientRect();
    const artTop = docTop(drawing);
    const center = pageWidth / 2;
    const artWidth = Math.min(760, artBox.width);
    const x = fraction => center - artWidth / 2 + fraction * artWidth;
    const y = fraction => artTop + fraction * artBox.height;
    endingBottom = y(.94);
    // Loose knots gradually open into a quiet final stem above the copy.
    ending = curve(lane, closingTop + 110, x(.03), y(.64), x(.22), y(.64));
    ending += curve(x(.39), y(.64), x(.29), y(.01), x(.22), y(.25));
    ending += curve(x(.13), y(.61), x(.43), y(.86), x(.48), y(.55));
    ending += curve(x(.58), y(.05), x(.37), y(.08), x(.41), y(.48));
    ending += curve(x(.46), y(.85), x(.62), y(.48), x(.53), y(.21));
    ending += curve(x(.43), y(-.01), x(.37), y(.47), x(.49), y(.64));
    ending += curve(x(.64), y(.81), x(.58), y(.03), x(.46), y(.16));
    ending += curve(x(.34), y(.29), x(.48), y(.81), x(.57), y(.51));
    ending += curve(x(.65), y(.22), x(.43), y(.08), x(.44), y(.39));
    ending += curve(x(.45), y(.62), x(.54), y(.55), x(.52), y(.35));
    ending += curve(x(.50), y(.18), x(.37), y(.35), x(.43), y(.56));
    ending += curve(x(.51), y(.86), x(.72), y(.64), x(.71), y(.41));
    ending += curve(x(.7), y(.22), x(.6), y(.43), x(.67), y(.58));
    ending += curve(x(.78), y(.79), center, y(.68), center, y(.94));

    const rightLane = pageWidth - lane;
    let answer = `M${point(rightLane, startY + 60)}`;
    let lastY = startY + 60;
    sections.filter(section => section !== closing).forEach((section, index) => {
      const bottom = Math.min(docTop(section) + section.getBoundingClientRect().height, closingTop);
      const height = bottom - lastY;
      // Keep the same loose handwriting, with different proportions per section.
      const variations = [
        [.52, 1, 1, .34, .14], [.43, .78, .93, .27, .18],
        [.60, .92, .75, .24, .12], [.48, .72, 1, .35, .16],
        [.55, 1, .86, .29, .20], [.45, .85, .72, .30, .13],
        [.57, .94, .96, .25, .15]
      ];
      const [turn, inward, outward, depth, rise] = variations[index % variations.length];
      const innerX = rightLane - (inside - lane) * inward;
      const outerX = rightLane + (lane - outside) * outward;
      answer += curve(rightLane, lastY + height * .24, innerX, lastY + height * (turn - .28), innerX, lastY + height * turn);
      answer += curve(innerX, lastY + height * (turn + depth), outerX, lastY + height * (turn + depth * .38), outerX, lastY + height * (turn - .03));
      answer += curve(outerX, lastY + height * (turn - rise), rightLane, lastY + height * .76, rightLane, bottom);
      // A small spiral grows out of the margin line, rather than floating over text.
      if (pageWidth > 900 && (index === 1 || index === 3)) {
        const r = Math.min(30, span * .3);
        answer += curve(rightLane, bottom + r, rightLane - r * 1.6, bottom + r, rightLane - r * 1.6, bottom);
        answer += curve(rightLane - r * 1.6, bottom - r * 1.5, rightLane + r, bottom - r * 1.5, rightLane + r, bottom);
        answer += curve(rightLane + r, bottom + r * 1.3, rightLane - r, bottom + r * 1.1, rightLane - r, bottom);
        answer += curve(rightLane - r, bottom - r * .6, rightLane, bottom - r * .6, rightLane, bottom);
      }
      lastY = bottom;
    });
    // One unbroken arc arrives at the upper knot, with no horizontal join
    // above the small loop. Its last handle matches the knot's tangent.
    answer += curve(rightLane, closingTop + 115, x(.70), y(-.10), x(.46), y(.16));
    right.setAttribute('d', answer);

    const contact = document.querySelector('.contact');
    const contactStart = docTop(contact);
    const contactEnd = contactStart + contact.getBoundingClientRect().height;
    const endY = docTop(closing) + closing.getBoundingClientRect().height;
    gradient.setAttribute('y2', endY);
    const stops = [
      [(contactStart - 24) / endY, '#a85f43'],
      [(contactStart + 24) / endY, '#edb69a'],
      [(contactEnd - 24) / endY, '#edb69a'],
      [(contactEnd + 24) / endY, '#a85f43']
    ];
    colorStops.forEach((stop, index) => {
      stop.setAttribute('offset', Math.max(0, Math.min(1, stops[index][0])));
      stop.setAttribute('stop-color', stops[index][1]);
    });
    render();
  }

  function scheduleDraw() {
    if (!layoutFrame) layoutFrame = requestAnimationFrame(draw);
  }
  function updatePlayback() {
    canvas.classList.toggle('is-paused', paused || reducedMotion.matches || document.hidden);
    pauseButton.disabled = reducedMotion.matches;
    pauseButton.setAttribute('aria-pressed', String(paused));
    pauseButton.textContent = reducedMotion.matches ? 'Movimento reduzido' : paused ? 'Retomar animação do fundo' : 'Pausar animação do fundo';
  }

  pauseButton.hidden = false;
  pauseButton.addEventListener('click', () => { paused = !paused; updatePlayback(); });
  reducedMotion.addEventListener('change', updatePlayback);
  document.addEventListener('visibilitychange', updatePlayback);
  window.addEventListener('resize', scheduleDraw, { passive: true });
  window.addEventListener('scroll', () => {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(render);
  }, { passive: true });
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(scheduleDraw);
    [header, ...sections].forEach(node => observer.observe(node));
  }
  document.fonts?.ready.then(scheduleDraw);
  document.querySelectorAll('img').forEach(img => {
    if (!img.complete) img.addEventListener('load', scheduleDraw, { once: true });
  });
  document.querySelectorAll('details').forEach(item => item.addEventListener('toggle', scheduleDraw));
  updatePlayback();
  draw();
})();
