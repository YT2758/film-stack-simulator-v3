import type { SimulationSnapshot } from '../domain/flow'

export type MetricKind = 'etched-depth' | 'open-columns' | 'enclosed-voids' | 'via-landed-area'

interface MetricGridProps {
  snapshot: SimulationSnapshot
  active: MetricKind | null
  onActiveChange: (metric: MetricKind | null) => void
  onShowViaMeasurement?: () => void
}

export function MetricGrid({ snapshot, active, onActiveChange, onShowViaMeasurement }: MetricGridProps) {
  const metrics = snapshot.metrics
  const viaCells = metrics.viaAreaCells
  const cards: Array<{ id: MetricKind; label: string; value: string; unit: string; width: number; warning?: boolean; definition: string }> = [
    {
      id: 'etched-depth', label: 'ETCHED DEPTH', value: String(Math.round(metrics.etchedDepthNm)), unit: 'nm',
      width: Math.min(100, metrics.etchedDepthNm / 2),
      definition: `Running maximum of actual material cells removed in one enabled etch through this preview, at the current Y cut; not commanded depth and not a sum. ${metrics.etchedDepthMeasurement ? `Measured at column ${metrics.etchedDepthMeasurement.column + 1} from step ${metrics.etchedDepthMeasurement.sourceStepIndex + 1}.` : 'No etch removal has been measured.'}`,
    },
    {
      id: 'open-columns', label: 'MASK-OPEN COLUMNS', value: String(metrics.openColumns), unit: `/ ${snapshot.width}`,
      width: metrics.openColumns / snapshot.width * 100,
      definition: 'Count of cross-section X columns selected by visible opening/via layout polygons at the current Y cut, including the active etch overlay. This describes the mask, not whether the material surface is physically open.',
    },
    {
      id: 'enclosed-voids', label: 'ENCLOSED VOIDS', value: String(metrics.voidCount), unit: 'regions',
      width: Math.min(100, metrics.voidCount), warning: metrics.voidCount > 0,
      definition: 'Count of four-neighbour connected empty regions in the current 2D cross-section that do not touch any grid boundary. Zero is a measured zero; it is not “no data”.',
    },
    {
      id: 'via-landed-area', label: 'VIA LANDED AREA', value: metrics.viaLandedAreaPercent === undefined ? '—' : String(Math.round(metrics.viaLandedAreaPercent)), unit: metrics.viaLandedAreaPercent === undefined ? 'N/A' : '%',
      width: metrics.viaLandedAreaPercent ?? 0,
      definition: metrics.viaLandedAreaPercent === undefined
        ? 'Not applicable: the whole top-down layout raster contains no nominal via cells.'
        : `Whole-layout top-down overlap of shifted via cells with metal cells: ${viaCells?.landed ?? 0} landed / ${viaCells?.nominal ?? 0} nominal cells. A true 0% means via area exists but none overlaps metal.`,
    },
  ]

  return (
    <section className="metric-grid" aria-label="Simulation measurements">
      {cards.map((card) => {
        const selected = active === card.id
        return (
          <div key={card.id} className={selected ? 'active' : ''}>
            <button type="button" aria-expanded={selected} onClick={() => onActiveChange(selected ? null : card.id)}>
              <span>{card.label}</span><strong>{card.value}<small> {card.unit}</small></strong>
              <i className={card.warning ? 'warn' : ''} style={{ width: `${card.width}%` }} />
            </button>
            {selected && <p role="note">{card.definition}{card.id === 'via-landed-area' && metrics.viaLandedAreaPercent !== undefined && onShowViaMeasurement && <button type="button" onClick={onShowViaMeasurement}>Show exact top-down cells</button>}</p>}
          </div>
        )
      })}
    </section>
  )
}
