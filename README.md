# option-data.dna
// ============ SAFE NUMERIC HELPER ============
function safeNum(value: number, fallback: number = 0): number {
  return isFinite(value) ? value : fallback;
}

// ============ MAIN LEARNING FUNCTION (PRODUCTION FINAL) ============
async function updateFactorWeightsFromHistory() {
  // 1. Regime & stability
  const { regime, stability: regimeStability } = getStableRegime();
  const stepMultiplier = (regime === 'TRENDING') ? 0.7 : (regime === 'CHOPPY') ? 1.3 : 1.0;
  const effectiveMaxStep = MAX_STEP * stepMultiplier;

  // 2. Gather signals sorted by timestamp (performance fine)
  const allRecent = signalHistory.slice(-LEARNING_WINDOW);
  const sortedSignals = [...allRecent].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // 3. Collect factor contributions for correlation & normalization
  const factorContributions: Record<string, number[]> = {};
  for (const factor of factorWeights) factorContributions[factor.name] = [];
  for (const sig of sortedSignals) {
    for (const factor of factorWeights) {
      const contrib = sig.factorContributions?.[factor.name] ?? 0;
      if (contrib !== 0) factorContributions[factor.name].push(contrib);
    }
  }

  // 4. Normalization factor (95th percentile)
  const normFactor: Record<string, number> = {};
  for (const factor of factorWeights) {
    const absVals = factorContributions[factor.name].map(c => Math.abs(c));
    if (absVals.length === 0) normFactor[factor.name] = 1e-6;
    else {
      const sorted = [...absVals].sort((a,b) => a - b);
      const idx = Math.ceil((NORMALIZATION_PERCENTILE / 100) * sorted.length) - 1;
      const val = sorted[Math.min(idx, sorted.length - 1)];
      normFactor[factor.name] = Math.max(1e-6, val);
    }
  }

  // 5. Pre‑compute factor directional accuracy (for exploration evaluation)
  const factorAccuracy: Record<string, number> = {};
  for (const factor of factorWeights) {
    let correct = 0, total = 0;
    for (const sig of sortedSignals.slice(-EXPLORATION_DELAY)) {
      for (const win of VERIFICATION_WINDOWS) {
        const outcome = sig.windowOutcomes[win.name];
        if (!outcome.verified) continue;
        if (sig.bias === 'NEUTRAL') continue;
        const actualMove = outcome.actualMove ?? 0;
        if (Math.abs(actualMove) < 1e-6) continue;
        const contribution = sig.factorContributions?.[factor.name] ?? 0;
        const factorDir = contribution > 0 ? 1 : (contribution < 0 ? -1 : 0);
        const actualDir = actualMove > 0 ? 1 : -1;
        if (factorDir === actualDir) correct++;
        total++;
      }
    }
    factorAccuracy[factor.name] = total > 0 ? correct / total : 0.5;
  }

  // 6. Process each factor
  for (const factor of factorWeights) {
    // [FIX 1] Safe stats access
    const stats = globalThis.explorationStats[factor.name];
    if (!stats) continue;

    const uniquePredictions = new Set<string>();
    let totalDirScore = 0, totalDirWeight = 0;
    let totalMagScore = 0, totalMagWeight = 0;
    let activeContributionCount = 0;

    for (let idx = 0; idx < sortedSignals.length; idx++) {
      const sig = sortedSignals[idx];
      let verifiedWeightSum = 0;
      let predDirScore = 0, predDirWeight = 0;
      let predMagScore = 0, predMagWeight = 0;
      let hasActive = false;

      for (const win of VERIFICATION_WINDOWS) {
        const outcome = sig.windowOutcomes[win.name];
        if (!outcome.verified) continue;
        const windowWeight = WINDOW_WEIGHTS[win.name] || 0.5;
        verifiedWeightSum += windowWeight;
        const contribution = sig.factorContributions?.[factor.name] ?? 0;
        if (Math.abs(contribution) >= 5) hasActive = true;
        if (sig.bias === 'NEUTRAL') continue;

        const actualMove = outcome.actualMove ?? 0;
        const actualDir = actualMove > 0 ? 1 : (actualMove < 0 ? -1 : 0);
        if (actualDir === 0) continue;
        const factorDir = contribution > 0 ? 1 : (contribution < 0 ? -1 : 0);
        const factorCorrect = (factorDir === actualDir);

        const strength = Math.min(1.0, Math.abs(contribution) / normFactor[factor.name]);
        const directionalDelta = factorCorrect ? +strength : -strength;
        predDirScore += directionalDelta * windowWeight;
        predDirWeight += strength * windowWeight;

        const maxMove = Math.min(2.0, Math.abs(actualMove) / 0.5);
        const factorMagnitude = factorCorrect ? maxMove : 0;
        predMagScore += factorMagnitude * windowWeight;
        predMagWeight += maxMove * windowWeight;
      }

      if (verifiedWeightSum >= MIN_VERIFIED_WEIGHT && (predDirWeight > 0 || predMagWeight > 0)) {
        const uniqueKey = `${sig.timestamp}_${sig.bias}`;
        uniquePredictions.add(uniqueKey);
        let recencyWeight = 1.0;
        if (USE_RECENCY_WEIGHT && sortedSignals.length > 1) {
          const timestamps = sortedSignals.map(s => new Date(s.timestamp).getTime());
          const minTs = timestamps[0];
          const maxTs = timestamps[timestamps.length-1];
          const ageFactor = (new Date(sig.timestamp).getTime() - minTs) / (maxTs - minTs + 1e-6);
          recencyWeight = 0.25 + 0.75 * Math.pow(ageFactor, 0.8);
        }
        totalDirScore += predDirScore * recencyWeight;
        totalDirWeight += predDirWeight * recencyWeight;
        totalMagScore += predMagScore * recencyWeight;
        totalMagWeight += predMagWeight * recencyWeight;
        if (hasActive) activeContributionCount++;
      }
    }

    const sampleCount = uniquePredictions.size;
    if (sampleCount < MIN_SAMPLES) continue;

    if (totalDirWeight > 0) {
      const rawDir = totalDirScore / totalDirWeight;
      const directionalAccuracy = (rawDir + 1) / 2;
      let magnitudeRatio = directionalAccuracy;
      if (totalMagWeight > 0) magnitudeRatio = totalMagScore / totalMagWeight;
      const activityRatio = safeNum(activeContributionCount / sampleCount, 0);

      // Correlation penalty (cached)
      let correlationPenalty = 1.0;
      const myContribs = factorContributions[factor.name];
      if (myContribs && myContribs.length >= 20) {
        let maxCorr = 0;
        for (const other of Object.keys(factorContributions)) {
          if (other === factor.name) continue;
          const otherContribs = factorContributions[other];
          if (!otherContribs || otherContribs.length < 20) continue;
          const corr = cachedCorrelation(myContribs, otherContribs, factor.name, other);
          if (Math.abs(corr) > maxCorr) maxCorr = Math.abs(corr);
        }
        if (maxCorr > CORRELATION_HARD_LIMIT) correlationPenalty = 0.2;
        else if (maxCorr > CORRELATION_SOFT_LIMIT) correlationPenalty = 1 - (maxCorr - CORRELATION_SOFT_LIMIT);
      }

      // Factor score
      const baseScore = directionalAccuracy * DIRECTION_WEIGHT + magnitudeRatio * MAGNITUDE_WEIGHT;
      const stabilityBoost = 0.6 + 0.4 * regimeStability;
      let factorScore = baseScore * activityRatio * correlationPenalty * stabilityBoost;
      factorScore = Math.min(1, Math.max(0, factorScore));

      // Confidence
      const confidence = factorScore * 0.6 + correlationPenalty * 0.2 + Math.min(1, sampleCount / 30) * 0.2;

      // Stability guard
      if (!isStableSample(sampleCount, confidence)) continue;

      // Target weight
      const targetWeight = 0.75 + Math.pow(factorScore, 1.5) * 1.25;

      // [FIX 3+4] Exploration: stage candidate, do NOT mutate immediately
      if (shouldExplore(confidence, regimeStability) && !stats.pendingExploration) {
        const p = stats.alpha / (stats.alpha + stats.beta);
        const direction = Math.random() < p ? 1 : -1;
        const candidateStep = direction * 0.05 * factor.weight;
        const candidateWeight = Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, factor.weight + candidateStep));
        stats.pendingExploration = {
          oldWeight: factor.weight,
          candidateWeight,
          direction,
          oldScore: factorAccuracy[factor.name] || 0.5,
          timestamp: Date.now(),
          applied: false,
        };
      }

      // Normal weight update (if no pending exploration or already applied)
      if (!stats.pendingExploration || stats.pendingExploration.applied) {
        let newWeight = applySafeWeightUpdate(factor.weight, targetWeight, regimeStability, effectiveMaxStep);
        factor.weight = roundToTwo(newWeight);
        factor.weight = roundToTwo(applyDriftClamp(factor.weight));
      }

      console.log(`📊 ${factor.name}: score ${factorScore.toFixed(3)}, conf ${confidence.toFixed(2)}, dirAcc ${(directionalAccuracy*100).toFixed(1)}%, magRatio ${(magnitudeRatio*100).toFixed(1)}%, act ${(activityRatio*100).toFixed(1)}%, corrPenalty ${correlationPenalty.toFixed(3)}, regime ${regime}, samples ${sampleCount}, weight → ${factor.weight}`);
    }
  }

  // 7. Evaluate pending explorations after delay
  for (const factor of factorWeights) {
    const stats = globalThis.explorationStats[factor.name];
    if (!stats || !stats.pendingExploration || stats.pendingExploration.applied) continue;
    if (Date.now() - stats.pendingExploration.timestamp > EXPLORATION_DELAY * 3 * 60 * 1000) {
      const currentScore = factorAccuracy[factor.name] || 0.5;
      const improvement = evaluateImprovement(stats.pendingExploration.oldScore, currentScore);
      if (improvement > EXPLORATION_IMPROVEMENT_THRESHOLD) {
        factor.weight = roundToTwo(stats.pendingExploration.candidateWeight);
        stats.alpha += 1;
      } else {
        stats.beta += 1;
      }
      stats.pendingExploration.applied = true;
      stats.pendingExploration = null;
    }
  }

  // 8. Periodic cache cleanup
  if (globalThis.correlationCache.size > 200) {
    globalThis.correlationCache.clear();
  }

  await saveAllPersistentData();
}
