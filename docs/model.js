// Cost model for a Cloud Storage bucket with and without Autoclass.
//
// Objects are tracked by days since last access, in 30-day steps. Each month a
// share of objects is read (and returns to Standard), the rest age 30 days,
// and new objects arrive in Standard. Autoclass moves unread objects:
//   30 days -> Nearline, and with an Archive terminal class,
//   90 days -> Coldline, 365 days -> Archive.
// Objects under 128 KiB are never moved and aren't charged the management fee.
// https://cloud.google.com/storage/docs/autoclass

export const DAYS_PER_MONTH = 30;
export const SMALL_OBJECT_BYTES = 128 * 1024;
export const GIB = 1024 ** 3;

/** The storage class Autoclass keeps an object in after `age` days without access. */
export function storageClass(age, terminal) {
  if (age < 30) return "standard";
  if (terminal === "nearline" || age < 90) return "nearline";
  if (age < 365) return "coldline";
  return "archive";
}

/**
 * Project monthly costs for `months` months.
 *
 * @param {object} input
 * @param {number} input.objects          objects in the bucket today
 * @param {number} input.newObjects       objects added per month
 * @param {number} input.objectSizeGiB    average object size
 * @param {number} input.accessedPercent  share of objects read each month (0-100)
 * @param {number} input.smallPercent     share of objects under 128 KiB (0-100)
 * @param {"nearline"|"archive"} input.terminal  Autoclass terminal storage class
 * @param {boolean} input.existingBucket  enabling on an existing bucket (one-time charge)
 * @param {number} input.months
 * @param {object} prices  one location from prices.json plus `classA` and `managementFee`
 */
export function project(input, prices) {
  const accessed = input.accessedPercent / 100;
  const managed = 1 - input.smallPercent / 100;
  const fee = prices.managementFee / 1000;

  // Managed objects by days since last access. Unmanaged small objects stay in Standard.
  let ages = new Map([[0, input.objects * managed]]);
  let small = input.objects * (1 - managed);
  const rows = [];

  for (let month = 1; month <= input.months; month++) {
    const managedCount = sum(ages.values());
    const total = managedCount + small;

    const standardCost = total * input.objectSizeGiB * prices.standard;

    const byClass = { standard: small, nearline: 0, coldline: 0, archive: 0 };
    for (const [age, count] of ages) byClass[storageClass(age, input.terminal)] += count;

    let autoclassCost = 0;
    for (const [cls, count] of Object.entries(byClass)) autoclassCost += count * input.objectSizeGiB * prices[cls];
    autoclassCost += managedCount * fee;
    // Reads from Coldline or Archive move the object back to Standard with a Class A operation.
    autoclassCost += (byClass.coldline + byClass.archive) * accessed * prices.classA;
    if (month === 1 && input.existingBucket) autoclassCost += input.objects * managed * prices.classA;

    rows.push({ month, objects: total, byClass, standardCost, autoclassCost });

    ages = age30(ages, accessed);
    ages.set(0, (ages.get(0) ?? 0) + input.newObjects * managed);
    small += input.newObjects * (1 - managed);
  }
  return rows;
}

/** Age every object 30 days, except the share that was read, which resets to 0. */
function age30(ages, accessed) {
  const next = new Map();
  const add = (age, count) => next.set(age, (next.get(age) ?? 0) + count);
  for (const [age, count] of ages) {
    add(0, count * accessed);
    // Nothing changes after a year, so cap ages there to keep the map small.
    add(Math.min(age + DAYS_PER_MONTH, 365), count * (1 - accessed));
  }
  return next;
}

/** Totals across the projection. */
export function summarize(rows) {
  const standard = sum(rows.map((r) => r.standardCost));
  const autoclass = sum(rows.map((r) => r.autoclassCost));
  return {
    standard,
    autoclass,
    savings: standard - autoclass,
    savingsPercent: standard ? (1 - autoclass / standard) * 100 : 0,
  };
}

function sum(values) {
  let total = 0;
  for (const v of values) total += v;
  return total;
}
