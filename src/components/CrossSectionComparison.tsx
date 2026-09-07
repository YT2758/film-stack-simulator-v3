import type { FlowDocument, SimulationSnapshot } from '../domain/flow'
import { CrossSectionCanvas } from './CrossSectionCanvas'
import type { MetricKind } from './MetricGrid'
import { translate, type Language } from '../i18n'

interface CrossSectionComparisonProps {
  previous: SimulationSnapshot
  current: SimulationSnapshot
  document: FlowDocument
  measurement?: MetricKind | null
  language: Language
}

export function CrossSectionComparison({ previous, current, document, measurement, language }: CrossSectionComparisonProps) {
  return (
    <div className="comparison-wrap" aria-label={translate(language, 'comparisonLabel')}>
      <section className="comparison-panel" aria-labelledby="comparison-previous-title">
        <header><span>{translate(language, 'previous')}</span><strong id="comparison-previous-title">{previous.stepName}</strong></header>
        <CrossSectionCanvas snapshot={previous} document={document} language={language} embedded />
      </section>
      <section className="comparison-panel" aria-labelledby="comparison-current-title">
        <header><span>{translate(language, 'current')}</span><strong id="comparison-current-title">{current.stepName}</strong></header>
        <CrossSectionCanvas snapshot={current} compareTo={previous} document={document} measurement={measurement} language={language} embedded />
      </section>
    </div>
  )
}
