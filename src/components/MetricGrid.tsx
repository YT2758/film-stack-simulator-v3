import type { SimulationSnapshot } from '../domain/flow'
import { translate, type Language } from '../i18n'

export type MetricKind = 'etched-depth' | 'open-columns' | 'enclosed-voids' | 'via-landed-area'

interface MetricGridProps {
  snapshot: SimulationSnapshot
  language: Language
  active: MetricKind | null
  onActiveChange: (metric: MetricKind | null) => void
  onShowViaMeasurement?: () => void
}

export function MetricGrid({ snapshot, language, active, onActiveChange, onShowViaMeasurement }: MetricGridProps) {
  const metrics = snapshot.metrics
  const viaCells = metrics.viaAreaCells
  const cards: Array<{ id: MetricKind; label: string; value: string; unit: string; width: number; warning?: boolean; definition: string }> = [
    {
      id: 'etched-depth', label: translate(language, 'etchedDepthMetric'), value: String(Math.round(metrics.etchedDepthNm)), unit: 'nm',
      width: Math.min(100, metrics.etchedDepthNm / 2),
      definition: `${translate(language, 'etchedDefinition')} ${metrics.etchedDepthMeasurement ? translate(language, 'etchedMeasured', { column: metrics.etchedDepthMeasurement.column + 1, step: metrics.etchedDepthMeasurement.sourceStepIndex + 1 }) : translate(language, 'etchedNone')}`,
    },
    {
      id: 'open-columns', label: translate(language, 'openColumnsMetric'), value: String(metrics.openColumns), unit: `/ ${snapshot.width}`,
      width: metrics.openColumns / snapshot.width * 100,
      definition: translate(language, 'openColumnsDefinition'),
    },
    {
      id: 'enclosed-voids', label: translate(language, 'enclosedVoidsMetric'), value: String(metrics.voidCount), unit: translate(language, 'regions'),
      width: Math.min(100, metrics.voidCount), warning: metrics.voidCount > 0,
      definition: translate(language, 'voidDefinition'),
    },
    {
      id: 'via-landed-area', label: translate(language, 'viaAreaMetric'), value: metrics.viaLandedAreaPercent === undefined ? '—' : String(Math.round(metrics.viaLandedAreaPercent)), unit: metrics.viaLandedAreaPercent === undefined ? translate(language, 'notApplicable') : '%',
      width: metrics.viaLandedAreaPercent ?? 0,
      definition: metrics.viaLandedAreaPercent === undefined
        ? translate(language, 'viaNotApplicable')
        : translate(language, 'viaDefinition', { landed: viaCells?.landed ?? 0, nominal: viaCells?.nominal ?? 0 }),
    },
  ]

  return (
    <section className="metric-grid" aria-label={translate(language, 'simulationMeasurements')}>
      {cards.map((card) => {
        const selected = active === card.id
        return (
          <div key={card.id} className={selected ? 'active' : ''}>
            <button type="button" aria-expanded={selected} onClick={() => onActiveChange(selected ? null : card.id)}>
              <span>{card.label}</span><strong>{card.value}<small> {card.unit}</small></strong>
              <i className={card.warning ? 'warn' : ''} style={{ width: `${card.width}%` }} />
            </button>
            {selected && <p role="note">{card.definition}{card.id === 'via-landed-area' && metrics.viaLandedAreaPercent !== undefined && onShowViaMeasurement && <button type="button" onClick={onShowViaMeasurement}>{translate(language, 'showExactCells')}</button>}</p>}
          </div>
        )
      })}
    </section>
  )
}
