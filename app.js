import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => Array.from(parent.querySelectorAll(selector));

const palette = ["#22d3ee", "#34d399", "#f59e0b", "#fb7185", "#a78bfa", "#f97316", "#84cc16", "#38bdf8"];

const moduleMeta = {
  geometry: ["Geometry & Algebra Workbench", "Canvas active"],
  graph3d: ["3D Multi-Variable Grapher", "Orbit controls active"],
  probability: ["Probability Distribution Simulator", "Chart active"],
  linear: ["Linear Algebra Matrix & Vector Suite", "Transformer active"]
};

const app = {
  activeModule: "geometry",
  geometry: {
    equations: [],
    primitives: [],
    nextId: 1,
    canvas: null,
    ctx: null,
    dpr: 1,
    width: 0,
    height: 0,
    scale: 48,
    originX: 0,
    originY: 0,
    initialized: false,
    drag: null,
    pan: null
  },
  graph3d: {
    renderer: null,
    scene: null,
    camera: null,
    controls: null,
    surfaceGroup: null,
    curveGroup: null,
    resizeObserver: null
  },
  probability: {
    chart: null,
    currentType: "line",
    values: {}
  },
  linear: {
    matrix: [
      [2, 1],
      [1, 2]
    ],
    vectorMode: 2,
    vector: [2, 1],
    transform2: [
      [1, 0.7],
      [0.2, 1]
    ],
    transform3: [
      [1, 0.2, 0],
      [0, 1, 0.45],
      [0.15, 0, 1]
    ],
    canvas: null,
    ctx: null,
    dpr: 1,
    width: 0,
    height: 0,
    animationT: 1,
    animationStart: null,
    renderer3: null,
    scene3: null,
    camera3: null,
    controls3: null,
    arrowOriginal: null,
    arrowAnimated: null,
    arrowTarget: null,
    resizeObserver: null
  }
};

const debounce = (fn, wait = 220) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  };
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const formatNumber = (value, precision = 5) => {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "undefined";
    if (Math.abs(value) < 1e-10) return "0";
  }

  try {
    return window.math.format(value, { precision });
  } catch {
    return String(value);
  }
};

const formatMatrix = matrix => {
  const arr = toArray(matrix);
  if (!Array.isArray(arr)) return formatNumber(arr);
  const rows = Array.isArray(arr[0]) ? arr : [arr];
  return rows
    .map(row => `[ ${row.map(value => formatNumber(value, 5)).join(", ")} ]`)
    .join("\n");
};

const toArray = value => {
  if (value && typeof value.toArray === "function") return value.toArray();
  return value;
};

const setWarning = (id, message = "") => {
  const node = $(id);
  if (node) node.textContent = message;
};

const parseExpression = raw => {
  const input = String(raw || "").trim();
  if (!input) throw new Error("Enter a formula.");
  const equalsIndex = input.indexOf("=");
  return equalsIndex >= 0 ? input.slice(equalsIndex + 1).trim() : input;
};

const parseMath = raw => {
  const expr = parseExpression(raw);
  return {
    expr,
    compiled: window.math.compile(expr),
    tex: window.math.parse(expr).toTex({ parenthesis: "keep" })
  };
};

const renderKatex = (node, tex, fallback) => {
  if (!node) return;
  if (window.katex) {
    try {
      window.katex.render(tex, node, { throwOnError: false, displayMode: false });
      return;
    } catch {
      node.textContent = fallback;
      return;
    }
  }
  node.textContent = fallback;
};

async function waitForLibraries() {
  for (let i = 0; i < 120; i += 1) {
    if (window.math && window.Chart && window.katex) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error("Required math libraries did not load.");
}

function boot() {
  waitForLibraries()
    .then(() => {
      setupTabs();
      initGeometry();
      initGraph3D();
      initProbability();
      initLinearAlgebra();
      switchModule("geometry");
      window.addEventListener("resize", debounce(handleResize, 80));
    })
    .catch(error => {
      console.error(error);
      const status = $("#moduleStatus");
      if (status) status.textContent = "Library load error";
    });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}

function setupTabs() {
  $$(".tab-button").forEach(button => {
    button.addEventListener("click", () => switchModule(button.dataset.module));
  });
}

function switchModule(name) {
  app.activeModule = name;
  $$(".tab-button").forEach(button => button.classList.toggle("active", button.dataset.module === name));
  $$(".module").forEach(module => module.classList.toggle("active", module.id === name));

  const [title, status] = moduleMeta[name];
  $("#moduleTitle").textContent = title;
  $("#moduleStatus").textContent = status;

  setTimeout(() => {
    handleResize();
    if (name === "probability" && app.probability.chart) app.probability.chart.resize();
  }, 40);
}

function handleResize() {
  resizeGeometryCanvas();
  resizeVectorCanvas();
  resizeThreeViewport(app.graph3d.renderer, app.graph3d.camera, $("#threeViewport"));
  resizeThreeViewport(app.linear.renderer3, app.linear.camera3, $("#vector3dViewport"));
}

/* Module 1: 2D geometry and algebra */

function initGeometry() {
  const state = app.geometry;
  state.canvas = $("#geoCanvas");
  state.ctx = state.canvas.getContext("2d");

  $("#geoAddEquation").addEventListener("click", addGeometryEquation);
  $("#geoFunctionInput").addEventListener("keydown", event => {
    if (event.key === "Enter") addGeometryEquation();
  });
  $("#geoFunctionInput").addEventListener(
    "input",
    debounce(() => validateGeometryInput(), 180)
  );
  $("#geoClearEquations").addEventListener("click", () => {
    state.equations = [];
    renderEquationList();
    drawGeometry();
  });
  $("#geoClearPrimitives").addEventListener("click", () => {
    state.primitives = [];
    drawGeometry();
  });
  $$(".tool-button[data-primitive]").forEach(button => {
    button.addEventListener("click", () => addPrimitive(button.dataset.primitive));
  });

  state.canvas.addEventListener("pointerdown", onGeometryPointerDown);
  state.canvas.addEventListener("pointermove", onGeometryPointerMove);
  state.canvas.addEventListener("pointerup", onGeometryPointerUp);
  state.canvas.addEventListener("pointerleave", onGeometryPointerUp);
  state.canvas.addEventListener("wheel", onGeometryWheel, { passive: false });

  resizeGeometryCanvas();
  addGeometryEquation();
  addPrimitive("point");
  addPrimitive("line");
  addPrimitive("circle");
}

function validateGeometryInput() {
  const raw = $("#geoFunctionInput").value;
  if (!raw.trim()) {
    setWarning("#geoError", "");
    return;
  }
  try {
    const parsed = parseMath(raw);
    parsed.compiled.evaluate({ x: 0 });
    setWarning("#geoError", "");
  } catch (error) {
    setWarning("#geoError", error.message);
  }
}

function addGeometryEquation() {
  const input = $("#geoFunctionInput");
  const raw = input.value.trim();
  try {
    const parsed = parseMath(raw);
    parsed.compiled.evaluate({ x: 0 });
    const color = palette[(app.geometry.nextId - 1) % palette.length];
    app.geometry.equations.push({
      id: app.geometry.nextId,
      raw,
      expr: parsed.expr,
      compiled: parsed.compiled,
      tex: parsed.tex,
      color,
      visible: true
    });
    app.geometry.nextId += 1;
    setWarning("#geoError", "");
    renderEquationList();
    drawGeometry();
  } catch (error) {
    setWarning("#geoError", error.message);
  }
}

function renderEquationList() {
  const list = $("#geoEquationList");
  list.innerHTML = "";
  if (app.geometry.equations.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No equations plotted.";
    list.appendChild(empty);
    return;
  }

  app.geometry.equations.forEach(eq => {
    const row = document.createElement("div");
    row.className = "equation-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = eq.visible;
    checkbox.setAttribute("aria-label", `Toggle ${eq.raw}`);
    checkbox.addEventListener("change", () => {
      eq.visible = checkbox.checked;
      drawGeometry();
    });

    const swatch = document.createElement("span");
    swatch.className = "equation-swatch";
    swatch.style.background = eq.color;

    const mathNode = document.createElement("div");
    mathNode.className = "equation-math";
    renderKatex(mathNode, `y=${eq.tex}`, `y = ${eq.expr}`);

    const del = document.createElement("button");
    del.className = "delete-button";
    del.textContent = "x";
    del.setAttribute("aria-label", `Delete ${eq.raw}`);
    del.addEventListener("click", () => {
      app.geometry.equations = app.geometry.equations.filter(item => item.id !== eq.id);
      renderEquationList();
      drawGeometry();
    });

    row.append(checkbox, swatch, mathNode, del);
    list.appendChild(row);
  });
}

function addPrimitive(type) {
  const state = app.geometry;
  const index = state.primitives.length;
  if (type === "point") {
    state.primitives.push({ type, p: { x: -3 + index * 0.25, y: 2 - index * 0.2 }, color: "#f59e0b" });
  }
  if (type === "line") {
    state.primitives.push({
      type,
      p1: { x: -4, y: -2 + index * 0.18 },
      p2: { x: 3, y: 1.6 + index * 0.15 },
      color: "#a78bfa"
    });
  }
  if (type === "circle") {
    state.primitives.push({ type, c: { x: 2.2, y: -1.4 }, r: 1.45, color: "#34d399" });
  }
  drawGeometry();
}

function resizeGeometryCanvas() {
  const state = app.geometry;
  if (!state.canvas) return;
  const rect = state.canvas.parentElement.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;

  const previousCenter = state.initialized ? screenToWorld(state.width / 2, state.height / 2) : { x: 0, y: 0 };
  state.dpr = window.devicePixelRatio || 1;
  state.width = rect.width;
  state.height = rect.height;
  state.canvas.width = Math.floor(rect.width * state.dpr);
  state.canvas.height = Math.floor(rect.height * state.dpr);
  state.canvas.style.width = `${rect.width}px`;
  state.canvas.style.height = `${rect.height}px`;
  state.ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

  if (!state.initialized) {
    state.originX = state.width / 2;
    state.originY = state.height / 2;
    state.initialized = true;
  } else {
    state.originX = state.width / 2 - previousCenter.x * state.scale;
    state.originY = state.height / 2 + previousCenter.y * state.scale;
  }
  drawGeometry();
}

function screenToWorld(px, py) {
  const state = app.geometry;
  return {
    x: (px - state.originX) / state.scale,
    y: (state.originY - py) / state.scale
  };
}

function worldToScreen(x, y) {
  const state = app.geometry;
  return {
    x: state.originX + x * state.scale,
    y: state.originY - y * state.scale
  };
}

function niceGridStep(targetWorldUnits) {
  const exponent = Math.floor(Math.log10(targetWorldUnits));
  const base = targetWorldUnits / 10 ** exponent;
  const nice = base < 2 ? 1 : base < 5 ? 2 : 5;
  return nice * 10 ** exponent;
}

function drawGeometry() {
  const state = app.geometry;
  if (!state.ctx) return;
  const ctx = state.ctx;
  ctx.clearRect(0, 0, state.width, state.height);
  drawGeometryGrid(ctx);
  state.equations.forEach(eq => {
    if (eq.visible) drawFunctionCurve(ctx, eq);
  });
  state.primitives.forEach(primitive => drawPrimitive(ctx, primitive));
}

function drawGeometryGrid(ctx) {
  const state = app.geometry;
  ctx.save();
  ctx.fillStyle = "#081120";
  ctx.fillRect(0, 0, state.width, state.height);

  const min = screenToWorld(0, state.height);
  const max = screenToWorld(state.width, 0);
  const step = niceGridStep(70 / state.scale);
  const subStep = step / 5;

  ctx.lineWidth = 1;
  for (let x = Math.floor(min.x / subStep) * subStep; x <= max.x; x += subStep) {
    const p = worldToScreen(x, 0);
    ctx.strokeStyle = Math.abs(x % step) < subStep / 2 ? "rgba(148, 163, 184, 0.2)" : "rgba(148, 163, 184, 0.08)";
    ctx.beginPath();
    ctx.moveTo(p.x, 0);
    ctx.lineTo(p.x, state.height);
    ctx.stroke();
  }

  for (let y = Math.floor(min.y / subStep) * subStep; y <= max.y; y += subStep) {
    const p = worldToScreen(0, y);
    ctx.strokeStyle = Math.abs(y % step) < subStep / 2 ? "rgba(148, 163, 184, 0.2)" : "rgba(148, 163, 184, 0.08)";
    ctx.beginPath();
    ctx.moveTo(0, p.y);
    ctx.lineTo(state.width, p.y);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(226, 232, 240, 0.55)";
  ctx.lineWidth = 1.5;
  const origin = worldToScreen(0, 0);
  ctx.beginPath();
  ctx.moveTo(0, origin.y);
  ctx.lineTo(state.width, origin.y);
  ctx.moveTo(origin.x, 0);
  ctx.lineTo(origin.x, state.height);
  ctx.stroke();

  ctx.fillStyle = "#94a3b8";
  ctx.font = "12px Inter, sans-serif";
  ctx.fillText("x", state.width - 18, origin.y - 8);
  ctx.fillText("y", origin.x + 8, 18);
  ctx.restore();
}

function drawFunctionCurve(ctx, eq) {
  const state = app.geometry;
  ctx.save();
  ctx.strokeStyle = eq.color;
  ctx.lineWidth = 2.4;
  ctx.beginPath();

  let hasPoint = false;
  let lastY = null;
  for (let px = 0; px <= state.width; px += 2) {
    const x = screenToWorld(px, 0).x;
    let y;
    try {
      y = eq.compiled.evaluate({ x });
    } catch {
      hasPoint = false;
      lastY = null;
      continue;
    }

    if (typeof y !== "number" || !Number.isFinite(y) || Math.abs(y) > 1e6) {
      hasPoint = false;
      lastY = null;
      continue;
    }

    const point = worldToScreen(x, y);
    if (!hasPoint || (lastY !== null && Math.abs(point.y - lastY) > state.height * 0.65)) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
    hasPoint = true;
    lastY = point.y;
  }
  ctx.stroke();
  ctx.restore();
}

function drawPrimitive(ctx, primitive) {
  ctx.save();
  ctx.strokeStyle = primitive.color;
  ctx.fillStyle = primitive.color;
  ctx.lineWidth = 2;

  if (primitive.type === "point") {
    const p = worldToScreen(primitive.p.x, primitive.p.y);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "12px Inter, sans-serif";
    ctx.fillText(`(${formatNumber(primitive.p.x, 3)}, ${formatNumber(primitive.p.y, 3)})`, p.x + 10, p.y - 10);
  }

  if (primitive.type === "line") {
    const p1 = worldToScreen(primitive.p1.x, primitive.p1.y);
    const p2 = worldToScreen(primitive.p2.x, primitive.p2.y);
    drawInfiniteLine(ctx, p1, p2);
    drawHandle(ctx, p1.x, p1.y, primitive.color);
    drawHandle(ctx, p2.x, p2.y, primitive.color);
  }

  if (primitive.type === "circle") {
    const c = worldToScreen(primitive.c.x, primitive.c.y);
    const edge = worldToScreen(primitive.c.x + primitive.r, primitive.c.y);
    ctx.beginPath();
    ctx.arc(c.x, c.y, Math.abs(edge.x - c.x), 0, Math.PI * 2);
    ctx.stroke();
    drawHandle(ctx, c.x, c.y, primitive.color);
    drawHandle(ctx, edge.x, edge.y, primitive.color);
  }
  ctx.restore();
}

function drawInfiniteLine(ctx, p1, p2) {
  const state = app.geometry;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  ctx.beginPath();
  ctx.moveTo(p1.x - ux * state.width * 2, p1.y - uy * state.width * 2);
  ctx.lineTo(p1.x + ux * state.width * 2, p1.y + uy * state.width * 2);
  ctx.stroke();
}

function drawHandle(ctx, x, y, color) {
  ctx.save();
  ctx.fillStyle = "#081120";
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function canvasPoint(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

function findGeometryHandle(point) {
  const state = app.geometry;
  for (let i = state.primitives.length - 1; i >= 0; i -= 1) {
    const primitive = state.primitives[i];
    const handles = getPrimitiveHandles(primitive);
    for (const handle of handles) {
      const screen = worldToScreen(handle.point.x, handle.point.y);
      if (Math.hypot(point.x - screen.x, point.y - screen.y) < 12) {
        return { primitive, handle: handle.key };
      }
    }
  }
  return null;
}

function getPrimitiveHandles(primitive) {
  if (primitive.type === "point") return [{ key: "p", point: primitive.p }];
  if (primitive.type === "line") {
    return [
      { key: "p1", point: primitive.p1 },
      { key: "p2", point: primitive.p2 }
    ];
  }
  if (primitive.type === "circle") {
    return [
      { key: "center", point: primitive.c },
      { key: "radius", point: { x: primitive.c.x + primitive.r, y: primitive.c.y } }
    ];
  }
  return [];
}

function onGeometryPointerDown(event) {
  const state = app.geometry;
  const point = canvasPoint(event, state.canvas);
  const handle = findGeometryHandle(point);
  state.canvas.setPointerCapture(event.pointerId);
  if (handle) {
    state.drag = handle;
    state.canvas.style.cursor = "grabbing";
    return;
  }
  state.pan = {
    x: point.x,
    y: point.y,
    originX: state.originX,
    originY: state.originY
  };
}

function onGeometryPointerMove(event) {
  const state = app.geometry;
  const point = canvasPoint(event, state.canvas);
  const world = screenToWorld(point.x, point.y);
  $("#geoCoordinates").textContent = `x: ${formatNumber(world.x, 4)}, y: ${formatNumber(world.y, 4)}`;

  if (state.drag) {
    const { primitive, handle } = state.drag;
    if (primitive.type === "circle" && handle === "radius") {
      primitive.r = Math.max(0.1, Math.hypot(world.x - primitive.c.x, world.y - primitive.c.y));
    } else if (primitive.type === "circle" && handle === "center") {
      primitive.c.x = world.x;
      primitive.c.y = world.y;
    } else {
      primitive[handle].x = world.x;
      primitive[handle].y = world.y;
    }
    drawGeometry();
    return;
  }

  if (state.pan) {
    state.originX = state.pan.originX + (point.x - state.pan.x);
    state.originY = state.pan.originY + (point.y - state.pan.y);
    drawGeometry();
    return;
  }

  state.canvas.style.cursor = findGeometryHandle(point) ? "grab" : "crosshair";
}

function onGeometryPointerUp(event) {
  const state = app.geometry;
  if (state.canvas && state.canvas.hasPointerCapture?.(event.pointerId)) {
    state.canvas.releasePointerCapture(event.pointerId);
  }
  state.drag = null;
  state.pan = null;
  if (state.canvas) state.canvas.style.cursor = "crosshair";
}

function onGeometryWheel(event) {
  event.preventDefault();
  const state = app.geometry;
  const point = canvasPoint(event, state.canvas);
  const before = screenToWorld(point.x, point.y);
  const factor = event.deltaY < 0 ? 1.12 : 0.88;
  state.scale = clamp(state.scale * factor, 14, 240);
  state.originX = point.x - before.x * state.scale;
  state.originY = point.y + before.y * state.scale;
  drawGeometry();
}

/* Module 2: 3D grapher */

function initGraph3D() {
  const viewport = $("#threeViewport");
  const state = app.graph3d;

  state.scene = new THREE.Scene();
  state.scene.background = new THREE.Color("#081120");
  state.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  state.camera.position.set(9, 8, 11);

  state.renderer = new THREE.WebGLRenderer({ antialias: true });
  state.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  state.renderer.setSize(viewport.clientWidth || 600, viewport.clientHeight || 500);
  viewport.appendChild(state.renderer.domElement);

  state.controls = new OrbitControls(state.camera, state.renderer.domElement);
  state.controls.enableDamping = true;
  state.controls.dampingFactor = 0.08;
  state.controls.target.set(0, 0, 0);

  const ambient = new THREE.AmbientLight(0xffffff, 0.65);
  const directional = new THREE.DirectionalLight(0xffffff, 1.0);
  directional.position.set(7, 10, 8);
  state.scene.add(ambient, directional);

  add3DReference(state.scene);
  state.surfaceGroup = new THREE.Group();
  state.curveGroup = new THREE.Group();
  state.scene.add(state.surfaceGroup, state.curveGroup);

  $("#surfacePlotButton").addEventListener("click", buildSurfacePlot);
  $("#curvePlotButton").addEventListener("click", buildParametricCurve);
  ["surfaceInput", "xMin", "xMax", "yMin", "yMax"].forEach(id => {
    $(`#${id}`).addEventListener("input", debounce(buildSurfacePlot, 260));
  });
  ["curveX", "curveY", "curveZ", "tMin", "tMax"].forEach(id => {
    $(`#${id}`).addEventListener("input", debounce(buildParametricCurve, 260));
  });

  state.resizeObserver = new ResizeObserver(() => resizeThreeViewport(state.renderer, state.camera, viewport));
  state.resizeObserver.observe(viewport);

  buildSurfacePlot();
  buildParametricCurve();
  animateGraph3D();
}

function add3DReference(scene) {
  const grid = new THREE.GridHelper(14, 28, 0x475569, 0x1e293b);
  grid.position.y = 0;
  scene.add(grid);

  const axes = [
    { dir: new THREE.Vector3(1, 0, 0), color: 0xfb7185 },
    { dir: new THREE.Vector3(0, 1, 0), color: 0x34d399 },
    { dir: new THREE.Vector3(0, 0, 1), color: 0x38bdf8 }
  ];

  axes.forEach(axis => {
    scene.add(new THREE.ArrowHelper(axis.dir, new THREE.Vector3(0, 0, 0), 6.5, axis.color, 0.25, 0.16));
  });
}

function clearGroup(group) {
  while (group.children.length) {
    const child = group.children.pop();
    if (child.geometry) child.geometry.dispose();
    if (child.material) child.material.dispose();
  }
}

function buildSurfacePlot() {
  const state = app.graph3d;
  try {
    const { compiled } = parseMath($("#surfaceInput").value);
    const xMin = Number($("#xMin").value);
    const xMax = Number($("#xMax").value);
    const yMin = Number($("#yMin").value);
    const yMax = Number($("#yMax").value);
    if (![xMin, xMax, yMin, yMax].every(Number.isFinite) || xMax <= xMin || yMax <= yMin) {
      throw new Error("Use valid x/y domains with max greater than min.");
    }

    const segments = 76;
    const positions = [];
    const values = [];
    let zMin = Infinity;
    let zMax = -Infinity;

    for (let iy = 0; iy <= segments; iy += 1) {
      const y = yMin + ((yMax - yMin) * iy) / segments;
      for (let ix = 0; ix <= segments; ix += 1) {
        const x = xMin + ((xMax - xMin) * ix) / segments;
        let z = compiled.evaluate({ x, y });
        if (typeof z !== "number" || !Number.isFinite(z)) z = NaN;
        values.push(z);
        if (Number.isFinite(z)) {
          zMin = Math.min(zMin, z);
          zMax = Math.max(zMax, z);
        }
      }
    }

    if (!Number.isFinite(zMin) || !Number.isFinite(zMax)) throw new Error("Surface produced no finite z values.");

    values.forEach((z, index) => {
      const ix = index % (segments + 1);
      const iy = Math.floor(index / (segments + 1));
      const x = xMin + ((xMax - xMin) * ix) / segments;
      const y = yMin + ((yMax - yMin) * iy) / segments;
      positions.push(x, Number.isFinite(z) ? clamp(z, -20, 20) : 0, y);
    });

    const indices = [];
    const colors = [];
    const color = new THREE.Color();
    const span = Math.max(1e-6, zMax - zMin);
    values.forEach(z => {
      const normalized = Number.isFinite(z) ? clamp((z - zMin) / span, 0, 1) : 0;
      color.setHSL(0.66 - normalized * 0.55, 0.78, 0.55);
      colors.push(color.r, color.g, color.b);
    });

    for (let iy = 0; iy < segments; iy += 1) {
      for (let ix = 0; ix < segments; ix += 1) {
        const a = iy * (segments + 1) + ix;
        const b = a + 1;
        const c = a + segments + 1;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      side: THREE.DoubleSide,
      vertexColors: true,
      roughness: 0.62,
      metalness: 0.05
    });
    const mesh = new THREE.Mesh(geometry, material);

    const wire = new THREE.LineSegments(
      new THREE.WireframeGeometry(geometry),
      new THREE.LineBasicMaterial({ color: 0x0f172a, transparent: true, opacity: 0.22 })
    );

    clearGroup(state.surfaceGroup);
    state.surfaceGroup.add(mesh, wire);
    setWarning("#surfaceError", "");
  } catch (error) {
    setWarning("#surfaceError", error.message);
  }
}

function buildParametricCurve() {
  const state = app.graph3d;
  try {
    const xCompiled = parseMath($("#curveX").value).compiled;
    const yCompiled = parseMath($("#curveY").value).compiled;
    const zCompiled = parseMath($("#curveZ").value).compiled;
    const tMin = Number($("#tMin").value);
    const tMax = Number($("#tMax").value);
    if (!Number.isFinite(tMin) || !Number.isFinite(tMax) || tMax <= tMin) {
      throw new Error("Use a valid t domain.");
    }

    const positions = [];
    const samples = 520;
    for (let i = 0; i <= samples; i += 1) {
      const t = tMin + ((tMax - tMin) * i) / samples;
      const x = xCompiled.evaluate({ t });
      const y = yCompiled.evaluate({ t });
      const z = zCompiled.evaluate({ t });
      if ([x, y, z].every(Number.isFinite)) positions.push(x, z, y);
    }
    if (positions.length < 6) throw new Error("Curve produced too few finite points.");

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({ color: 0xfde047, linewidth: 3 });
    const line = new THREE.Line(geometry, material);
    clearGroup(state.curveGroup);
    state.curveGroup.add(line);
    setWarning("#curveError", "");
  } catch (error) {
    setWarning("#curveError", error.message);
  }
}

function resizeThreeViewport(renderer, camera, viewport) {
  if (!renderer || !camera || !viewport || viewport.classList.contains("hidden")) return;
  const rect = viewport.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  renderer.setSize(rect.width, rect.height, false);
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
}

function animateGraph3D() {
  requestAnimationFrame(animateGraph3D);
  const state = app.graph3d;
  if (!state.renderer) return;
  state.controls.update();
  state.renderer.render(state.scene, state.camera);
}

/* Module 3: probability simulator */

const distributionDefs = {
  normal: {
    label: "Normal",
    type: "continuous",
    params: [
      { key: "mean", label: "Mean", min: -5, max: 5, step: 0.1, value: 0 },
      { key: "sd", label: "Standard deviation", min: 0.2, max: 5, step: 0.1, value: 1 }
    ],
    range: p => [p.mean - 4 * p.sd, p.mean + 4 * p.sd],
    pdf: (x, p) => Math.exp(-0.5 * ((x - p.mean) / p.sd) ** 2) / (p.sd * Math.sqrt(2 * Math.PI)),
    cdf: (x, p) => 0.5 * (1 + erf((x - p.mean) / (p.sd * Math.SQRT2)))
  },
  uniform: {
    label: "Uniform",
    type: "continuous",
    params: [
      { key: "min", label: "Minimum", min: -10, max: 9, step: 0.1, value: 0 },
      { key: "max", label: "Maximum", min: -9, max: 10, step: 0.1, value: 5 }
    ],
    range: p => [p.min - 1, p.max + 1],
    pdf: (x, p) => (x >= p.min && x <= p.max ? 1 / Math.max(1e-9, p.max - p.min) : 0),
    cdf: (x, p) => (x <= p.min ? 0 : x >= p.max ? 1 : (x - p.min) / Math.max(1e-9, p.max - p.min))
  },
  exponential: {
    label: "Exponential",
    type: "continuous",
    params: [{ key: "rate", label: "Rate", min: 0.1, max: 4, step: 0.05, value: 1 }],
    range: p => [0, Math.max(6, 8 / p.rate)],
    pdf: (x, p) => (x >= 0 ? p.rate * Math.exp(-p.rate * x) : 0),
    cdf: (x, p) => (x <= 0 ? 0 : 1 - Math.exp(-p.rate * x))
  },
  binomial: {
    label: "Binomial",
    type: "discrete",
    params: [
      { key: "n", label: "Trials", min: 1, max: 60, step: 1, value: 12, integer: true },
      { key: "p", label: "Success probability", min: 0.01, max: 0.99, step: 0.01, value: 0.5 }
    ],
    support: p => Array.from({ length: p.n + 1 }, (_, k) => k),
    pmf: (k, p) => combination(p.n, k) * p.p ** k * (1 - p.p) ** (p.n - k)
  },
  poisson: {
    label: "Poisson",
    type: "discrete",
    params: [{ key: "lambda", label: "Rate", min: 0.2, max: 25, step: 0.1, value: 4 }],
    support: p => {
      const max = Math.ceil(p.lambda + 6 * Math.sqrt(p.lambda) + 6);
      return Array.from({ length: max + 1 }, (_, k) => k);
    },
    pmf: (k, p) => Math.exp(-p.lambda) * p.lambda ** k / factorial(k)
  }
};

function initProbability() {
  $("#distributionSelect").addEventListener("change", () => {
    resetDistributionValues();
    renderDistributionParams();
    resetIntervalForDistribution();
    updateProbability();
  });
  ["intervalMode", "intervalA", "intervalB"].forEach(id => {
    $(`#${id}`).addEventListener("input", updateProbability);
  });

  resetDistributionValues();
  renderDistributionParams();
  resetIntervalForDistribution();
  createProbabilityChart("line");
  updateProbability();
}

function resetDistributionValues() {
  const def = distributionDefs[$("#distributionSelect").value];
  app.probability.values = {};
  def.params.forEach(param => {
    app.probability.values[param.key] = param.value;
  });
}

function renderDistributionParams() {
  const def = distributionDefs[$("#distributionSelect").value];
  const container = $("#distributionParams");
  container.innerHTML = "<h4>Parameters</h4>";
  def.params.forEach(param => {
    const row = document.createElement("div");
    row.className = "range-row";
    const value = app.probability.values[param.key];

    row.innerHTML = `
      <div class="range-row-header">
        <span>${param.label}</span>
        <span id="paramValue-${param.key}">${formatNumber(value, 4)}</span>
      </div>
      <input id="param-${param.key}" type="range" min="${param.min}" max="${param.max}" step="${param.step}" value="${value}">
    `;
    container.appendChild(row);

    const slider = $(`#param-${param.key}`, row);
    slider.addEventListener("input", () => {
      let next = Number(slider.value);
      if (param.integer) next = Math.round(next);
      app.probability.values[param.key] = next;
      if ($("#distributionSelect").value === "uniform") {
        repairUniformParams(param.key);
      }
      renderParamValueLabels();
      updateProbability();
    });
  });
  renderParamValueLabels();
}

function renderParamValueLabels() {
  Object.entries(app.probability.values).forEach(([key, value]) => {
    const label = $(`#paramValue-${key}`);
    if (label) label.textContent = formatNumber(value, 4);
    const slider = $(`#param-${key}`);
    if (slider) slider.value = value;
  });
}

function repairUniformParams(changedKey) {
  const values = app.probability.values;
  if (values.max <= values.min) {
    if (changedKey === "min") values.max = Number((values.min + 0.1).toFixed(2));
    else values.min = Number((values.max - 0.1).toFixed(2));
  }
}

function resetIntervalForDistribution() {
  const type = $("#distributionSelect").value;
  const defaults = {
    normal: [-1, 1],
    uniform: [1, 4],
    exponential: [0.5, 2.5],
    binomial: [3, 8],
    poisson: [2, 7]
  };
  $("#intervalMode").value = "between";
  $("#intervalA").value = defaults[type][0];
  $("#intervalB").value = defaults[type][1];
}

function createProbabilityChart(type) {
  if (app.probability.chart) app.probability.chart.destroy();
  app.probability.currentType = type;
  const ctx = $("#probabilityChart").getContext("2d");
  app.probability.chart = new window.Chart(ctx, {
    type,
    data: { labels: [], datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { intersect: false, mode: "index" },
      plugins: {
        legend: {
          labels: { color: "#cbd5e1", boxWidth: 12 }
        },
        tooltip: {
          backgroundColor: "#020617",
          borderColor: "#334155",
          borderWidth: 1
        }
      },
      scales: {
        x: {
          ticks: { color: "#94a3b8", maxTicksLimit: 12 },
          grid: { color: "rgba(148, 163, 184, 0.12)" }
        },
        y: {
          beginAtZero: true,
          ticks: { color: "#94a3b8", maxTicksLimit: 8 },
          grid: { color: "rgba(148, 163, 184, 0.12)" }
        }
      }
    }
  });
}

function updateProbability() {
  const key = $("#distributionSelect").value;
  const def = distributionDefs[key];
  const params = { ...app.probability.values };
  const mode = $("#intervalMode").value;
  let a = Number($("#intervalA").value);
  let b = Number($("#intervalB").value);
  if (!Number.isFinite(a)) a = 0;
  if (!Number.isFinite(b)) b = a;

  if (def.type === "continuous") {
    updateContinuousDistribution(def, params, mode, a, b);
  } else {
    updateDiscreteDistribution(def, params, mode, a, b);
  }
}

function intervalContains(x, mode, a, b) {
  if (mode === "less") return x < a;
  if (mode === "greater") return x > a;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return x > lo && x < hi;
}

function updateContinuousDistribution(def, params, mode, a, b) {
  if (app.probability.currentType !== "line") createProbabilityChart("line");
  const [min, max] = def.range(params);
  const samples = 280;
  const labels = [];
  const curve = [];
  const shade = [];
  for (let i = 0; i <= samples; i += 1) {
    const x = min + ((max - min) * i) / samples;
    const y = def.pdf(x, params);
    labels.push(Number(x.toFixed(4)));
    curve.push({ x, y });
    shade.push({ x, y: intervalContains(x, mode, a, b) ? y : 0 });
  }

  const probability = continuousProbability(def, params, mode, a, b);
  const chart = app.probability.chart;
  chart.data.labels = labels;
  chart.data.datasets = [
    {
      label: `${def.label} density`,
      data: curve,
      borderColor: "#22d3ee",
      borderWidth: 2.4,
      pointRadius: 0,
      tension: 0.18,
      parsing: false
    },
    {
      label: "Selected interval",
      data: shade,
      borderColor: "rgba(245, 158, 11, 0.35)",
      backgroundColor: "rgba(245, 158, 11, 0.26)",
      pointRadius: 0,
      fill: "origin",
      parsing: false
    }
  ];
  chart.options.scales.x.type = "linear";
  chart.update("none");
  $("#probabilityReadout").textContent = `P = ${formatNumber(probability, 6)}`;
}

function updateDiscreteDistribution(def, params, mode, a, b) {
  if (app.probability.currentType !== "bar") createProbabilityChart("bar");
  const support = def.support(params);
  const labels = support.map(String);
  const values = support.map(k => def.pmf(k, params));
  const background = support.map(k => (intervalContains(k, mode, a, b) ? "rgba(245, 158, 11, 0.72)" : "rgba(34, 211, 238, 0.42)"));
  const probability = support.reduce((sum, k, index) => sum + (intervalContains(k, mode, a, b) ? values[index] : 0), 0);

  const chart = app.probability.chart;
  chart.data.labels = labels;
  chart.data.datasets = [
    {
      label: `${def.label} mass`,
      data: values,
      borderColor: "rgba(34, 211, 238, 0.85)",
      backgroundColor: background,
      borderWidth: 1
    }
  ];
  chart.options.scales.x.type = "category";
  chart.update("none");
  $("#probabilityReadout").textContent = `P = ${formatNumber(probability, 6)}`;
}

function continuousProbability(def, params, mode, a, b) {
  if (mode === "less") return clamp(def.cdf(a, params), 0, 1);
  if (mode === "greater") return clamp(1 - def.cdf(a, params), 0, 1);
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return clamp(def.cdf(hi, params) - def.cdf(lo, params), 0, 1);
}

function erf(x) {
  const sign = Math.sign(x) || 1;
  const abs = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * abs);
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-abs * abs);
  return sign * y;
}

function factorial(n) {
  if (n < 0) return NaN;
  let result = 1;
  for (let i = 2; i <= n; i += 1) result *= i;
  return result;
}

function combination(n, k) {
  if (k < 0 || k > n) return 0;
  const r = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= r; i += 1) {
    result = (result * (n - r + i)) / i;
  }
  return result;
}

/* Module 4: linear algebra */

function initLinearAlgebra() {
  const rows = $("#matrixRows");
  const cols = $("#matrixCols");
  for (let i = 1; i <= 4; i += 1) {
    rows.add(new Option(String(i), String(i), i === 2, i === 2));
    cols.add(new Option(String(i), String(i), i === 2, i === 2));
  }

  rows.addEventListener("change", resizeMatrixGrid);
  cols.addEventListener("change", resizeMatrixGrid);

  app.linear.canvas = $("#vectorCanvas");
  app.linear.ctx = app.linear.canvas.getContext("2d");
  $("#vectorMode").addEventListener("change", () => {
    app.linear.vectorMode = Number($("#vectorMode").value);
    app.linear.animationT = 1;
    renderVectorControls();
    toggleVectorView();
    renderVectorTransformer();
  });
  $("#animateVector").addEventListener("click", startVectorAnimation);

  renderMatrixGrid();
  computeMatrixMetrics();
  renderVectorControls();
  initLinear3D();
  toggleVectorView();
  resizeVectorCanvas();
  renderVectorTransformer();
}

function resizeMatrixGrid() {
  const rows = Number($("#matrixRows").value);
  const cols = Number($("#matrixCols").value);
  const next = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => (app.linear.matrix[r] && app.linear.matrix[r][c] !== undefined ? app.linear.matrix[r][c] : r === c ? 1 : 0))
  );
  app.linear.matrix = next;
  renderMatrixGrid();
  computeMatrixMetrics();
}

function renderMatrixGrid() {
  const grid = $("#matrixGrid");
  const rows = Number($("#matrixRows").value);
  const cols = Number($("#matrixCols").value);
  grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  grid.innerHTML = "";
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const input = document.createElement("input");
      input.className = "matrix-cell";
      input.type = "number";
      input.step = "0.1";
      input.value = app.linear.matrix[r][c];
      input.setAttribute("aria-label", `Matrix row ${r + 1} column ${c + 1}`);
      input.addEventListener("input", () => {
        app.linear.matrix[r][c] = Number(input.value || 0);
        computeMatrixMetrics();
      });
      grid.appendChild(input);
    }
  }
}

function computeMatrixMetrics() {
  const matrix = app.linear.matrix;
  const rows = matrix.length;
  const cols = matrix[0].length;
  const square = rows === cols;
  const metric = $("#matrixMetrics");
  metric.innerHTML = "";

  addMetric("Shape", `${rows} x ${cols}`);
  if (!square) {
    addMetric("Determinant", "Defined for square matrices only.");
    addMetric("Trace", "Defined for square matrices only.");
    addMetric("Inverse", "Defined for square matrices only.");
    addMetric("Eigenvalues", "Defined for square matrices only.");
    return;
  }

  try {
    addMetric("Determinant", formatNumber(window.math.det(matrix), 7));
  } catch (error) {
    addMetric("Determinant", error.message);
  }

  try {
    addMetric("Trace", formatNumber(window.math.trace(matrix), 7));
  } catch (error) {
    addMetric("Trace", error.message);
  }

  try {
    const det = window.math.det(matrix);
    if (Math.abs(det) < 1e-10) addMetric("Inverse", "Matrix is singular.");
    else addMetric("Inverse", formatMatrix(window.math.inv(matrix)));
  } catch (error) {
    addMetric("Inverse", error.message);
  }

  try {
    const eig = window.math.eigs(matrix);
    const values = toArray(eig.values || eig.lambda || []);
    const eigenvectors = eig.eigenvectors || [];
    let valueText = Array.isArray(values) ? values.map(value => formatNumber(value, 6)).join(", ") : formatNumber(values, 6);
    if (!valueText) valueText = "Unavailable";
    addMetric("Eigenvalues", valueText);
    if (Array.isArray(eigenvectors) && eigenvectors.length) {
      const vectorText = eigenvectors
        .slice(0, 4)
        .map((entry, index) => {
          const vector = entry.vector ? toArray(entry.vector) : toArray(entry);
          return `v${index + 1}: [${vector.map(value => formatNumber(value, 5)).join(", ")}]`;
        })
        .join("\n");
      addMetric("Eigenvectors", vectorText);
    }
  } catch (error) {
    addMetric("Eigenvalues", error.message);
  }
}

function addMetric(title, body) {
  const card = document.createElement("div");
  card.className = "metric-card";
  const pre = String(body).includes("\n") ? "pre" : "code";
  card.innerHTML = `<strong>${title}</strong><${pre}>${escapeHtml(String(body))}</${pre}>`;
  $("#matrixMetrics").appendChild(card);
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function renderVectorControls() {
  const mode = app.linear.vectorMode;
  const vectorContainer = $("#vectorInputs");
  vectorContainer.innerHTML = "";
  const labels = ["x", "y", "z"].slice(0, mode);

  labels.forEach((label, index) => {
    const wrap = document.createElement("label");
    wrap.textContent = `Vector ${label}`;
    const input = document.createElement("input");
    input.type = "number";
    input.step = "0.1";
    input.value = getVector()[index] ?? 0;
    input.addEventListener("input", () => {
      const vector = getVector();
      vector[index] = Number(input.value || 0);
      setVector(vector);
      app.linear.animationT = 1;
      renderVectorTransformer();
    });
    wrap.appendChild(input);
    vectorContainer.appendChild(wrap);
  });

  const transform = getTransform();
  const grid = $("#transformGrid");
  grid.innerHTML = "";
  grid.style.gridTemplateColumns = `repeat(${mode}, minmax(0, 1fr))`;
  for (let r = 0; r < mode; r += 1) {
    for (let c = 0; c < mode; c += 1) {
      const input = document.createElement("input");
      input.className = "matrix-cell";
      input.type = "number";
      input.step = "0.1";
      input.value = transform[r][c];
      input.setAttribute("aria-label", `Transform row ${r + 1} column ${c + 1}`);
      input.addEventListener("input", () => {
        transform[r][c] = Number(input.value || 0);
        setTransform(transform);
        app.linear.animationT = 1;
        renderVectorTransformer();
      });
      grid.appendChild(input);
    }
  }
}

function getVector() {
  return app.linear.vector.slice(0, app.linear.vectorMode);
}

function setVector(vector) {
  app.linear.vector = vector.slice();
}

function getTransform() {
  return app.linear.vectorMode === 2 ? app.linear.transform2.map(row => row.slice()) : app.linear.transform3.map(row => row.slice());
}

function setTransform(matrix) {
  if (app.linear.vectorMode === 2) app.linear.transform2 = matrix.map(row => row.slice());
  else app.linear.transform3 = matrix.map(row => row.slice());
}

function transformedVector() {
  const matrix = getTransform();
  const vector = getVector();
  return matrix.map(row => row.reduce((sum, value, index) => sum + value * vector[index], 0));
}

function toggleVectorView() {
  const is3D = app.linear.vectorMode === 3;
  $("#vectorCanvas").classList.toggle("hidden", is3D);
  $("#vector3dViewport").classList.toggle("hidden", !is3D);
  resizeThreeViewport(app.linear.renderer3, app.linear.camera3, $("#vector3dViewport"));
}

function resizeVectorCanvas() {
  const state = app.linear;
  if (!state.canvas || state.canvas.classList.contains("hidden")) return;
  const rect = state.canvas.parentElement.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  state.dpr = window.devicePixelRatio || 1;
  state.width = rect.width;
  state.height = rect.height;
  state.canvas.width = Math.floor(rect.width * state.dpr);
  state.canvas.height = Math.floor(rect.height * state.dpr);
  state.canvas.style.width = `${rect.width}px`;
  state.canvas.style.height = `${rect.height}px`;
  state.ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  renderVectorTransformer();
}

function renderVectorTransformer() {
  const source = getVector();
  const target = transformedVector();
  $("#vectorReadout").textContent = `[${source.map(v => formatNumber(v, 4)).join(", ")}] -> [${target.map(v => formatNumber(v, 4)).join(", ")}]`;

  if (app.linear.vectorMode === 2) {
    drawVector2D(source, target, app.linear.animationT);
  } else {
    updateVector3D(source, target, app.linear.animationT);
  }
}

function startVectorAnimation() {
  app.linear.animationT = 0;
  app.linear.animationStart = performance.now();
  requestAnimationFrame(stepVectorAnimation);
}

function stepVectorAnimation(now) {
  const state = app.linear;
  if (state.animationStart === null) return;
  const elapsed = now - state.animationStart;
  state.animationT = clamp(elapsed / 900, 0, 1);
  renderVectorTransformer();
  if (state.animationT < 1) requestAnimationFrame(stepVectorAnimation);
  else state.animationStart = null;
}

function drawVector2D(source, target, t) {
  const state = app.linear;
  if (!state.ctx || state.canvas.classList.contains("hidden")) return;
  const ctx = state.ctx;
  const width = state.width;
  const height = state.height;
  const origin = { x: width / 2, y: height / 2 };
  const maxMagnitude = Math.max(4, Math.hypot(...source), Math.hypot(...target));
  const scale = Math.min(width, height) / (2.5 * maxMagnitude);
  const current = source.map((value, index) => value + (target[index] - value) * easeInOut(t));

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#081120";
  ctx.fillRect(0, 0, width, height);
  drawVectorGrid(ctx, origin, scale, width, height);

  drawArrow2D(ctx, origin, source, scale, "#22d3ee", "v");
  drawArrow2D(ctx, origin, target, scale, "rgba(251, 113, 133, 0.55)", "Av");
  drawArrow2D(ctx, origin, current, scale, "#f59e0b", "");

  ctx.save();
  ctx.strokeStyle = "rgba(245, 158, 11, 0.5)";
  ctx.setLineDash([6, 6]);
  const sp = vectorToScreen(source, origin, scale);
  const cp = vectorToScreen(current, origin, scale);
  ctx.beginPath();
  ctx.moveTo(sp.x, sp.y);
  ctx.lineTo(cp.x, cp.y);
  ctx.stroke();
  ctx.restore();
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function drawVectorGrid(ctx, origin, scale, width, height) {
  const step = niceVectorStep(65 / scale);
  const minX = -(origin.x / scale);
  const maxX = (width - origin.x) / scale;
  const minY = -(height - origin.y) / scale;
  const maxY = origin.y / scale;

  ctx.lineWidth = 1;
  for (let x = Math.floor(minX / step) * step; x <= maxX; x += step) {
    const px = origin.x + x * scale;
    ctx.strokeStyle = Math.abs(x) < 1e-9 ? "rgba(226, 232, 240, 0.55)" : "rgba(148, 163, 184, 0.13)";
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, height);
    ctx.stroke();
  }
  for (let y = Math.floor(minY / step) * step; y <= maxY; y += step) {
    const py = origin.y - y * scale;
    ctx.strokeStyle = Math.abs(y) < 1e-9 ? "rgba(226, 232, 240, 0.55)" : "rgba(148, 163, 184, 0.13)";
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(width, py);
    ctx.stroke();
  }
}

function niceVectorStep(target) {
  const exponent = Math.floor(Math.log10(target));
  const base = target / 10 ** exponent;
  return (base < 2 ? 1 : base < 5 ? 2 : 5) * 10 ** exponent;
}

function vectorToScreen(vector, origin, scale) {
  return {
    x: origin.x + vector[0] * scale,
    y: origin.y - vector[1] * scale
  };
}

function drawArrow2D(ctx, origin, vector, scale, color, label) {
  const end = vectorToScreen(vector, origin, scale);
  const angle = Math.atan2(end.y - origin.y, end.x - origin.x);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(origin.x, origin.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(end.x - 12 * Math.cos(angle - Math.PI / 7), end.y - 12 * Math.sin(angle - Math.PI / 7));
  ctx.lineTo(end.x - 12 * Math.cos(angle + Math.PI / 7), end.y - 12 * Math.sin(angle + Math.PI / 7));
  ctx.closePath();
  ctx.fill();

  if (label) {
    ctx.font = "700 13px Inter, sans-serif";
    ctx.fillText(label, end.x + 8, end.y - 8);
  }
  ctx.restore();
}

function initLinear3D() {
  const viewport = $("#vector3dViewport");
  const state = app.linear;
  state.scene3 = new THREE.Scene();
  state.scene3.background = new THREE.Color("#081120");
  state.camera3 = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  state.camera3.position.set(7, 7, 9);

  state.renderer3 = new THREE.WebGLRenderer({ antialias: true });
  state.renderer3.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  viewport.appendChild(state.renderer3.domElement);

  state.controls3 = new OrbitControls(state.camera3, state.renderer3.domElement);
  state.controls3.enableDamping = true;
  state.controls3.target.set(0, 0, 0);

  state.scene3.add(new THREE.AmbientLight(0xffffff, 0.65));
  const light = new THREE.DirectionalLight(0xffffff, 0.9);
  light.position.set(6, 8, 7);
  state.scene3.add(light);
  add3DReference(state.scene3);

  state.arrowOriginal = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 1, 0x22d3ee, 0.22, 0.14);
  state.arrowAnimated = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 1, 0xf59e0b, 0.25, 0.16);
  state.arrowTarget = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 1, 0xfb7185, 0.2, 0.12);
  [state.arrowOriginal, state.arrowAnimated, state.arrowTarget].forEach(arrow => state.scene3.add(arrow));

  state.resizeObserver = new ResizeObserver(() => resizeThreeViewport(state.renderer3, state.camera3, viewport));
  state.resizeObserver.observe(viewport);
  animateLinear3D();
}

function updateVector3D(source, target, t) {
  const current = source.map((value, index) => value + (target[index] - value) * easeInOut(t));
  setArrowFromVector(app.linear.arrowOriginal, source, 0x22d3ee, 1);
  setArrowFromVector(app.linear.arrowTarget, target, 0xfb7185, 0.55);
  setArrowFromVector(app.linear.arrowAnimated, current, 0xf59e0b, 1);
}

function setArrowFromVector(arrow, vector, color, opacity) {
  if (!arrow) return;
  const threeVector = new THREE.Vector3(vector[0] || 0, vector[2] || 0, vector[1] || 0);
  const length = threeVector.length();
  const direction = length > 1e-8 ? threeVector.clone().normalize() : new THREE.Vector3(1, 0, 0);
  arrow.setDirection(direction);
  arrow.setLength(Math.max(length, 0.001), 0.25, 0.15);
  arrow.setColor(new THREE.Color(color));
  arrow.cone.material.transparent = true;
  arrow.line.material.transparent = true;
  arrow.cone.material.opacity = opacity;
  arrow.line.material.opacity = opacity;
}

function animateLinear3D() {
  requestAnimationFrame(animateLinear3D);
  const state = app.linear;
  if (!state.renderer3) return;
  state.controls3.update();
  state.renderer3.render(state.scene3, state.camera3);
}
