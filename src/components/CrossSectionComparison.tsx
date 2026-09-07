import type { FlowDocument, SimulationSnapshot } from '../domain/flow'
import { CrossSectionCanvas } from './CrossSectionCanvas'
import type { MetricKind } from './MetricGrid'

interface CrossSectionComparisonProps {
  previous: SimulationSnapshot
  current: SimulationSnapshot
  document: FlowDocument
  measurement?: MetricKind | null
}

export function CrossSectionComparison({ previous, current, document, measurement }: CrossSectionComparisonProps) {
  return (
    <div className="comparison-wrap" aria-label="Previous and current process comparison">
      <section className="comparison-panel" aria-labelledby="comparison-previous-title">
        <header><span>Previous</span><strong id="comparison-previous-title">{previous.stepName}</strong></header>
        <CrossSectionCanvas snapshot={previous} document={document} embedded />
      </section>
      <section className="comparison-panel" aria-labelledby="comparison-current-title">
        <header><span>Current</span><strong id="comparison-current-title">{current.stepName}</strong></header>
        <CrossSectionCanvas snapshot={current} compareTo={previous} document={document} measurement={measurement} embedded />
      </section>
    </div>
  )
}
