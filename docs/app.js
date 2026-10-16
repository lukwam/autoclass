import { GIB, project, summarize } from "./model.js";

const UNITS = { KiB: 1024, MiB: 1024 ** 2, GiB: GIB };
const form = document.getElementById("inputs");
const usd = (digits) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: digits });
const money = usd(0);
const count = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

const prices = await (await fetch("prices.json")).json();
populateLocations(prices.locations);
restoreFromUrl();
document.getElementById("fee").textContent = usd(4).format(prices.management_fee_per_1000_objects);
document.getElementById("prices-updated").textContent = prices.updated;

let chart;
form.addEventListener("input", update);
update();

function populateLocations(locations) {
  const select = form.elements.location;
  const groups = { "multi-region": "Multi-regions", region: "Regions" };
  for (const [type, label] of Object.entries(groups)) {
    const group = document.createElement("optgroup");
    group.label = label;
    for (const [id, location] of Object.entries(locations)) {
      if (location.type === type) group.append(new Option(`${location.name} (${id})`, id));
    }
    select.append(group);
  }
  select.value = "us-central1" in locations ? "us-central1" : select.options[0].value;
}

function readInputs() {
  const f = form.elements;
  return {
    location: f.location.value,
    objects: Math.max(0, Number(f.objects.value) || 0),
    newObjects: Math.max(0, Number(f.newObjects.value) || 0),
    objectSizeGiB: (Math.max(0, Number(f.size.value) || 0) * UNITS[f.sizeUnit.value]) / GIB,
    accessedPercent: Number(f.accessedPercent.value),
    smallPercent: Number(f.smallPercent.value),
    terminal: f.terminal.value,
    existingBucket: f.existingBucket.checked,
    months: Number(f.months.value),
  };
}

function update() {
  const input = readInputs();
  const location = prices.locations[input.location];
  const rows = project(input, {
    ...location,
    classA: prices.class_a_per_operation[location.type],
    managementFee: prices.management_fee_per_1000_objects,
  });
  const totals = summarize(rows);

  form.elements.accessedOut.value = `${input.accessedPercent}%`;
  form.elements.smallOut.value = `${input.smallPercent}%`;
  document.getElementById("total-standard").textContent = money.format(totals.standard);
  document.getElementById("total-autoclass").textContent = money.format(totals.autoclass);
  document.getElementById("total-savings").textContent =
    `${money.format(totals.savings)} (${totals.savingsPercent.toFixed(0)}%)`;
  document.getElementById("period").textContent = `Totals over ${input.months} months in ${location.name}.`;

  renderTable(rows);
  renderChart(rows);
  saveToUrl();
}

function renderTable(rows) {
  const cell = (text) => Object.assign(document.createElement("td"), { textContent: text });
  document.getElementById("rows").replaceChildren(
    ...rows.map((r) => {
      const tr = document.createElement("tr");
      tr.append(
        cell(r.month),
        cell(count.format(r.objects)),
        ...["standard", "nearline", "coldline", "archive"].map((c) => cell(count.format(r.byClass[c]))),
        cell(money.format(r.standardCost)),
        cell(money.format(r.autoclassCost)),
      );
      return tr;
    }),
  );
}

function renderChart(rows) {
  if (!window.Chart) return; // The chart is optional if the CDN is unreachable.
  const css = getComputedStyle(document.documentElement);
  const color = (name) => css.getPropertyValue(name).trim();
  const datasets = [
    {
      label: "Standard only",
      data: rows.map((r) => r.standardCost),
      borderColor: color("--standard"),
      borderDash: [6, 4],
    },
    {
      label: "Autoclass",
      data: rows.map((r) => r.autoclassCost),
      borderColor: color("--autoclass"),
      backgroundColor: color("--autoclass"),
    },
  ].map((d) => ({ ...d, pointRadius: 0, borderWidth: 2, tension: 0.2 }));

  if (chart) {
    chart.data.labels = rows.map((r) => r.month);
    chart.data.datasets.forEach((d, i) => {
      d.data = datasets[i].data;
    });
    chart.update();
    return;
  }
  Chart.defaults.color = color("--muted");
  Chart.defaults.borderColor = color("--border");
  chart = new Chart(document.getElementById("chart"), {
    type: "line",
    data: { labels: rows.map((r) => r.month), datasets },
    options: {
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { title: { display: true, text: "Month" } },
        y: {
          beginAtZero: true,
          ticks: { callback: (v) => money.format(v) },
          title: { display: true, text: "Cost per month" },
        },
      },
      plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${money.format(c.parsed.y)}` } } },
    },
  });
}

// Keep the inputs in the URL so a scenario can be shared as a link.
function saveToUrl() {
  const params = new URLSearchParams();
  for (const el of form.elements) {
    if (!el.name || el.tagName === "OUTPUT" || el.tagName === "FIELDSET") continue;
    if (el.type === "radio" && !el.checked) continue;
    params.set(el.name, el.type === "checkbox" ? (el.checked ? "1" : "0") : el.value);
  }
  history.replaceState(null, "", `?${params}`);
}

function restoreFromUrl() {
  const params = new URLSearchParams(location.search);
  for (const [name, value] of params) {
    const el = form.elements[name];
    if (!el) continue;
    if (el instanceof RadioNodeList) el.value = value;
    else if (el.type === "checkbox") el.checked = value === "1";
    else if (el.tagName !== "SELECT" || [...el.options].some((o) => o.value === value)) el.value = value;
  }
}
