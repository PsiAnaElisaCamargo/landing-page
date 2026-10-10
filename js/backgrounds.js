(() => {
  'use strict';

  const main = document.querySelector('main');
  const header = document.querySelector('.site-header');
  const symbol = header?.querySelector('.brand-symbol');
  const closing = document.querySelector('.thought-closing');
  const drawing = closing?.querySelector('.thought-drawing');
  if (!main || !symbol || !drawing) return;

  const ns = 'http://www.w3.org/2000/svg';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const sections = [...main.querySelectorAll(':scope > section')];
  let layoutFrame = 0;
  let scrollFrame = 0;
  let scrollIdleTimer = 0;
  let scrolling = false;
  let touching = false;
  let segments = [];
  let lane = 0;
  let inside = 0;
  let pageWidth = 0;
  let closingTop = 0;

  function element(tag, attributes, parent) {
    const node = document.createElementNS(ns, tag);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
    parent.append(node);
    return node;
  }

  // The fixed layer keeps the thread attached to the sticky brand symbol.
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

  // The closing artwork scrolls with the document, without waiting for JS.
  const closingCanvas = element('svg', {
    class: 'story-thread story-thread--closing', 'aria-hidden': 'true',
    focusable: 'false', preserveAspectRatio: 'none'
  }, document.body);
  const closingDefs = element('defs', {}, closingCanvas);
  const closingGradient = element('linearGradient', {
    id: 'thread-closing-ink', gradientUnits: 'userSpaceOnUse', x1: 0, x2: 0, y1: 0
  }, closingDefs);
  const closingStops = Array.from({ length: 4 }, () => element('stop', {}, closingGradient));
  const closingRight = element('path', { class: 'thread-answer', stroke: 'url(#thread-closing-ink)' }, closingCanvas);
  const closingLeft = element('path', { class: 'thread-line', stroke: 'url(#thread-closing-ink)' }, closingCanvas);
  const closingTraveler = element('path', { class: 'thread-traveler', stroke: 'url(#thread-closing-ink)' }, closingCanvas);
  const crossingTravelers = [];
  const travelerObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    entries.forEach(entry => entry.target.classList.toggle('is-offscreen', !entry.isIntersecting));
  }, { rootMargin: '80px' }) : null;
  travelerObserver?.observe(closingTraveler);

  function setMobileTraveler(path, d, delay) {
    path.setAttribute('d', d);
    // Two evenly spaced highlights per local path, near its start and middle.
    const cycle = (Math.ceil(path.getTotalLength()) + 56) / 2;
    path.style.setProperty('--thread-cycle', cycle);
    path.style.strokeDasharray = `56 ${cycle - 56}`;
    path.style.animationDuration = `${cycle / 60}s`;
    path.style.animationDelay = `${delay}s`;
  }

  const docTop = node => node.getBoundingClientRect().top + window.scrollY;
  const point = (x, y) => `${x.toFixed(2)} ${y.toFixed(2)}`;
  const curve = (x1, y1, x2, y2, x3, y3) => `C${point(x1, y1)} ${point(x2, y2)} ${point(x3, y3)}`;

  function addSegment(x0, y0, x1, x2, x3, y3) {
    segments.push({ x0, y0, x1, x2, x3, y3 });
  }

  function mobileRoute(startY) {
    const center = pageWidth / 2;
    const crossings = [];
    let originD = '';
    let side = lane;
    let lastY = startY;
    let d = `M${point(side, startY)}`;
    const followMargin = bottom => {
      const height = bottom - lastY;
      const bend = side < center ? 3 : -3;
      d += curve(side + bend, lastY + height / 3,
        side - bend, lastY + height * 2 / 3, side, bottom);
      lastY = bottom;
    };

    sections.slice(1).filter(section => section !== closing).forEach((section, index) => {
      const previous = sections[index];
      const boundary = docTop(section);
      // Cross only inside section padding, leaving space around the content.
      const before = Math.min(56, parseFloat(getComputedStyle(previous).paddingBottom) - 12);
      const after = Math.min(56, parseFloat(getComputedStyle(section).paddingTop) - 12);
      const middle = boundary + (after - before) / 2;
      const radius = Math.min(25, (before + after) / 3.6);
      const direction = side < center ? 1 : -1;
      const x = offset => center + direction * offset;
      const opposite = pageWidth - side;
      followMargin(boundary - before);
      if (!originD) originD = d;
      const crossingStart = d.length;
      const crossingMove = `M${point(side, boundary - before)}`;

      // Repeat the same tangle, mirrored toward the destination margin by x().
      // Shared derivatives keep the entry, turns and exit smoothly connected.
      const turns = 3;
      const omega = Math.PI * 2 * turns;
      const tilt = -8;
      const spread = 32;
      const baseRadius = 26;
      const swelling = 5;
      const knot = t => {
        const envelope = Math.sin(Math.PI * t) ** 2;
        const envelopeSlope = Math.PI * Math.sin(Math.PI * 2 * t);
        const rx = baseRadius + swelling * envelope;
        const ry = radius * (.88 + .12 * envelope);
        const sine = Math.sin(omega * t);
        const cosine = Math.cos(omega * t);
        return {
          x: x(spread * (t - .5) + rx * sine + tilt * cosine),
          y: middle + ry * cosine - radius * .65,
          dx: direction * (spread + swelling * envelopeSlope * sine + rx * omega * cosine - tilt * omega * sine),
          dy: radius * .12 * envelopeSlope * cosine - ry * omega * sine
        };
      };
      const entry = knot(0);
      const entrySpan = Math.abs(entry.x - side);
      // Start bending early along the margin, then ease into the loop.
      // Unequal handles create a broad arc instead of a flat horizontal bridge.
      const entryTop = boundary - before;
      d += curve(side, entryTop + (entry.y - entryTop) * .65,
        entry.x - direction * entrySpan * .45, entry.y, entry.x, entry.y);
      const steps = turns * 16;
      for (let step = 0; step < steps; step++) {
        const a = knot(step / steps);
        const b = knot((step + 1) / steps);
        const handle = 1 / (steps * 3);
        d += curve(a.x + a.dx * handle, a.y + a.dy * handle,
          b.x - b.dx * handle, b.y - b.dy * handle, b.x, b.y);
      }
      const exit = knot(1);
      const exitSpan = Math.abs(opposite - exit.x);
      const exitBottom = boundary + after;
      d += curve(exit.x + direction * exitSpan * .45, exit.y,
        opposite, exitBottom - (exitBottom - exit.y) * .65, opposite, exitBottom);
      crossings.push(crossingMove + d.slice(crossingStart));
      side = opposite;
      lastY = boundary + after;
    });
    followMargin(closingTop);
    return { d, side, originD: originD || d, crossings };
  }

  function mobileEnding(endingLane, x, y, center) {
    // One open sweep, a wider central tangle, then a separate right-hand loop.
    let d = curve(endingLane, y(.34), x(.22), y(.67), x(.44), y(.54));
    d += curve(x(.66), y(.40), x(.57), y(.03), x(.41), y(.19));
    d += curve(x(.24), y(.36), x(.45), y(.79), x(.59), y(.54));
    d += curve(x(.72), y(.30), x(.41), y(.05), x(.36), y(.31));
    d += curve(x(.31), y(.60), x(.65), y(.75), x(.62), y(.40));
    d += curve(x(.59), y(.07), x(.32), y(.18), x(.40), y(.49));
    d += curve(x(.46), y(.77), x(.72), y(.63), x(.81), y(.43));
    d += curve(x(.91), y(.18), x(.71), y(.25), x(.75), y(.48));
    d += curve(x(.79), y(.66), x(.92), y(.61), x(.74), y(.72));
    d += curve(x(.62), y(.80), center, y(.79), center, y(.94));
    return d;
  }

  function render() {
    scrollFrame = 0;
    // Mobile uses one document-anchored path; scrolling never rebuilds its knots.
    if (pageWidth <= 700) return;
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
    const drop = Math.max(280, Math.min(560, window.innerHeight * .65));
    const joinY = Math.min(headerBottom + drop, closingTop);
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
    const handle = Math.max(0, Math.min(available * .42, Math.max(0, room) / Math.max(.001, Math.abs(slope))));
    // One broad cubic from the symbol to the page, split exactly at the header.
    // No forced vertical leg or independent handles at the navbar boundary.
    const p0 = [startX, startY];
    const p1 = [Math.max(3, startX - Math.min(160, startX * .72)), startY + Math.min(36, available * .08)];
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
    // Keep the turn stable when mobile browser chrome changes viewport height.
    const artBox = drawing.getBoundingClientRect();
    closingTop = docTop(closing) - Math.min(160, artBox.height * .8);
    const containers = [...main.querySelectorAll('.container')];
    const gutter = Math.max(12, Math.min(...containers.map(node => node.getBoundingClientRect().left)) - 7);
    const outside = Math.max(3, Math.min(18, gutter * .12));
    inside = Math.max(outside + 4, gutter - 3);
    lane = outside + (inside - outside) * .48;
    const span = inside - outside;
    segments = [];
    // A sine wave distributes the bend evenly, without the flat stretches
    // and concentrated turns produced by cubing the sine.
    const length = closingTop - startY;
    const waveLength = 1700;
    const waveCount = Math.max(1, Math.round(length / waveLength));
    const steps = waveCount * 24;
    const omega = Math.PI * 2 * waveCount;
    const edgeWidth = Math.min(.12, .35 / waveCount);
    const taper = t => {
      const distance = Math.min(t, 1 - t);
      if (distance >= edgeWidth) return { value: 1, slope: 0 };
      const u = Math.max(0, distance / edgeWidth);
      return {
        value: u * u * (3 - 2 * u),
        slope: 6 * u * (1 - u) / edgeWidth * (t < .5 ? 1 : -1)
      };
    };
    const wave = t => {
      const phase = omega * t;
      // Ease into vertical tangents at the origin and the closing artwork.
      const edge = taper(t);
      const amplitude = span * .39 * edge.value;
      const amplitudeSlope = span * .39 * edge.slope;
      const sine = Math.sin(phase);
      return {
        x: lane - amplitude * sine,
        slope: (-amplitudeSlope * sine - amplitude * Math.cos(phase) * omega) / length
      };
    };
    for (let index = 0; index < steps; index++) {
      const t0 = index / steps, t1 = (index + 1) / steps;
      const a = wave(t0), b = wave(t1);
      const height = length / steps;
      addSegment(a.x, startY + length * t0, a.x + a.slope * height / 3,
        b.x - b.slope * height / 3, b.x, startY + length * t1);
    }

    const artTop = docTop(drawing);
    const center = pageWidth / 2;
    const route = pageWidth <= 700 ? mobileRoute(startY) : null;
    const artWidth = Math.min(route ? 420 : 760, artBox.width);
    const endingLane = route ? route.side : lane;
    const direction = endingLane < center ? 1 : -1;
    const x = fraction => center + (fraction - .5) * artWidth * direction;
    const y = fraction => artTop + fraction * artBox.height;
    // Drop along the margin before sweeping gently into the closing drawing.
    let ending = route ? route.d + mobileEnding(endingLane, x, y, center) : `M${point(lane, closingTop)}`;
    if (!route) {
      const arrivalX = x(.22);
      const arrivalY = y(.64);
      // Spread the final turn over the whole approach, rather than dropping
      // vertically and concentrating the bend just before the artwork.
      ending += curve(endingLane, closingTop + (arrivalY - closingTop) * .55,
        arrivalX - (arrivalX - endingLane) * .55, arrivalY, arrivalX, arrivalY);
      // Loose knots gradually open into a quiet final stem above the copy.
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
    }

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
      // Flow through the section boundary without a small loop or a short
      // corrective tail; both adjoining curves share a vertical tangent.
      answer += curve(outerX, lastY + height * (turn - rise), rightLane, lastY + height * .76, rightLane, bottom);
      lastY = bottom;
    });
    // One unbroken arc arrives at the upper knot, with no horizontal join
    // above the small loop. Its last handle matches the knot's tangent.
    right.setAttribute('d', answer);
    closingRight.setAttribute('d', `M${point(rightLane, lastY)}`
      + curve(rightLane, closingTop + 115, x(.70), y(-.10), x(.46), y(.16)));
    closingLeft.setAttribute('d', ending);
    if (route) {
      setMobileTraveler(closingTraveler, route.originD, -1);
      route.crossings.forEach((d, index) => {
        if (!crossingTravelers[index]) {
          crossingTravelers[index] = element('path', {
            class: 'thread-traveler is-offscreen', stroke: 'url(#thread-closing-ink)'
          }, closingCanvas);
          if (travelerObserver) travelerObserver.observe(crossingTravelers[index]);
          else crossingTravelers[index].classList.remove('is-offscreen');
        }
        setMobileTraveler(crossingTravelers[index], d, -1);
      });
    } else {
      closingTraveler.removeAttribute('style');
      closingTraveler.setAttribute('d', ending);
    }
    while (crossingTravelers.length > (route?.crossings.length || 0)) {
      const path = crossingTravelers.pop();
      travelerObserver?.unobserve(path);
      path.remove();
    }

    const contact = document.querySelector('.contact');
    const contactStart = docTop(contact);
    const contactEnd = contactStart + contact.getBoundingClientRect().height;
    const endY = docTop(closing) + closing.getBoundingClientRect().height;
    gradient.setAttribute('y2', endY);
    closingGradient.setAttribute('y2', endY);
    const canvasTop = route ? startY : closingTop;
    closingCanvas.setAttribute('viewBox', `0 ${canvasTop} ${pageWidth} ${endY - canvasTop}`);
    closingCanvas.style.top = `${canvasTop - docTop(document.body)}px`;
    closingCanvas.style.height = `${endY - canvasTop}px`;
    const stops = [
      [(contactStart - 24) / endY, '#a85f43'],
      [(contactStart + 24) / endY, '#edb69a'],
      [(contactEnd - 24) / endY, '#edb69a'],
      [(contactEnd + 24) / endY, '#a85f43']
    ];
    colorStops.forEach((stop, index) => {
      [stop, closingStops[index]].forEach(node => {
        node.setAttribute('offset', Math.max(0, Math.min(1, stops[index][0])));
        node.setAttribute('stop-color', stops[index][1]);
      });
    });
    render();
  }

  function scheduleDraw() {
    if (!layoutFrame) layoutFrame = requestAnimationFrame(draw);
  }
  function updatePlayback() {
    [canvas, closingCanvas].forEach(node => {
      node.classList.toggle('is-paused', reducedMotion.matches || document.hidden || scrolling || touching);
    });
  }

  function pauseForScroll() {
    clearTimeout(scrollIdleTimer);
    if (!scrolling) {
      scrolling = true;
      updatePlayback();
    }
    // Keep the pause through slow gestures and the end of momentum scrolling.
    scrollIdleTimer = setTimeout(() => {
      scrolling = false;
      updatePlayback();
    }, 450);
  }

  function updateTouch(event) {
    touching = event.touches.length > 0;
    pauseForScroll();
    updatePlayback();
  }

  reducedMotion.addEventListener('change', updatePlayback);
  document.addEventListener('visibilitychange', updatePlayback);
  // Pause before the first scroll event, and never resume under a held finger.
  ['touchstart', 'touchend', 'touchcancel'].forEach(type => {
    window.addEventListener(type, updateTouch, { passive: true });
  });
  window.addEventListener('wheel', pauseForScroll, { passive: true });
  window.addEventListener('resize', () => {
    // Browser chrome changes height while scrolling; the mobile route only
    // needs rebuilding for width or content changes (observed below).
    if (pageWidth <= 700 && pageWidth === document.documentElement.clientWidth) return;
    scheduleDraw();
  }, { passive: true });
  window.addEventListener('scroll', () => {
    // Pause at every viewport width, including landscape phones and tablets.
    pauseForScroll();
    if (pageWidth <= 700) return;
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
