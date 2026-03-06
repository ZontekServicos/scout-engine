type HistoricalTransferRecord = {
  predictedSuccess: boolean;
  actualSuccess: boolean;
};

export type ModelValidationResult = {
  modelAccuracy: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  sampleSize: number;
};

function toPercent(value: number): number {
  return Number((value * 100).toFixed(2));
}

export function validateModel(records: HistoricalTransferRecord[]): ModelValidationResult {
  const sampleSize = records.length;

  if (!sampleSize) {
    return {
      modelAccuracy: 0,
      falsePositiveRate: 0,
      falseNegativeRate: 0,
      sampleSize: 0,
    };
  }

  let truePositives = 0;
  let trueNegatives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;

  for (const record of records) {
    if (record.predictedSuccess && record.actualSuccess) truePositives += 1;
    if (!record.predictedSuccess && !record.actualSuccess) trueNegatives += 1;
    if (record.predictedSuccess && !record.actualSuccess) falsePositives += 1;
    if (!record.predictedSuccess && record.actualSuccess) falseNegatives += 1;
  }

  const modelAccuracy = toPercent((truePositives + trueNegatives) / sampleSize);
  const falsePositiveRate = toPercent(falsePositives / Math.max(1, falsePositives + trueNegatives));
  const falseNegativeRate = toPercent(falseNegatives / Math.max(1, falseNegatives + truePositives));

  return {
    modelAccuracy,
    falsePositiveRate,
    falseNegativeRate,
    sampleSize,
  };
}

