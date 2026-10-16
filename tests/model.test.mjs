import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { project, storageClass, summarize } from "../docs/model.js";

const prices = {
  standard: 0.02,
  nearline: 0.01,
  coldline: 0.004,
  archive: 0.0012,
  classA: 0.000005,
  managementFee: 0.0025,
};
const base = {
  objects: 1_000_000,
  newObjects: 0,
  objectSizeGiB: 0.01,
  accessedPercent: 0,
  smallPercent: 0,
  terminal: "archive",
  existingBucket: false,
  months: 24,
};
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);

test("storage class thresholds", () => {
  assert.equal(storageClass(0, "archive"), "standard");
  assert.equal(storageClass(29, "archive"), "standard");
  assert.equal(storageClass(30, "archive"), "nearline");
  assert.equal(storageClass(90, "archive"), "coldline");
  assert.equal(storageClass(365, "archive"), "archive");
  assert.equal(storageClass(365, "nearline"), "nearline");
});

test("month 1 is all Standard plus the management fee", () => {
  const [first] = project(base, prices);
  close(first.standardCost, 1_000_000 * 0.01 * 0.02);
  close(first.autoclassCost, 1_000_000 * 0.01 * 0.02 + 1_000_000 * 0.0000025);
});

test("unread objects walk down to Archive", () => {
  const rows = project(base, prices);
  assert.equal(rows[1].byClass.nearline, 1_000_000); // 30 days
  assert.equal(rows[3].byClass.coldline, 1_000_000); // 90 days
  assert.equal(rows[13].byClass.archive, 1_000_000); // capped at 365 after 13 months
});

test("Nearline terminal class never goes colder", () => {
  for (const row of project({ ...base, terminal: "nearline" }, prices)) {
    assert.equal(row.byClass.coldline + row.byClass.archive, 0);
  }
});

test("small objects stay in Standard with no fee", () => {
  const rows = project({ ...base, smallPercent: 100 }, prices);
  for (const row of rows) close(row.autoclassCost, row.standardCost);
});

test("objects read every month never leave Standard", () => {
  const rows = project({ ...base, accessedPercent: 100 }, prices);
  assert.equal(rows.at(-1).byClass.standard, 1_000_000);
});

test("enabling on an existing bucket costs one Class A operation per object, once", () => {
  const fresh = project(base, prices);
  const existing = project({ ...base, existingBucket: true }, prices);
  close(existing[0].autoclassCost - fresh[0].autoclassCost, 1_000_000 * 0.000005);
  close(existing[1].autoclassCost, fresh[1].autoclassCost);
});

test("new objects are added each month", () => {
  const rows = project({ ...base, newObjects: 1000, months: 3 }, prices);
  assert.deepEqual(
    rows.map((r) => r.objects),
    [1_000_000, 1_001_000, 1_002_000],
  );
});

test("summary totals and savings", () => {
  const summary = summarize(project(base, prices));
  assert.ok(summary.savings > 0);
  close(summary.savings, summary.standard - summary.autoclass);
});

test("prices.json has complete, ordered prices for every location", () => {
  const data = JSON.parse(readFileSync(new URL("../docs/prices.json", import.meta.url)));
  assert.ok(Object.keys(data.locations).length > 30);
  assert.ok(data.class_a_per_operation.region > 0 && data.class_a_per_operation["multi-region"] > 0);
  for (const [id, p] of Object.entries(data.locations)) {
    assert.ok(p.standard > p.nearline && p.nearline > p.coldline && p.coldline > p.archive && p.archive > 0, id);
  }
});
