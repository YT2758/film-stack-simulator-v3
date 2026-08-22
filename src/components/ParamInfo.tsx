import { useId, useState, type ReactNode } from 'react'
import { PARAM_DOCS } from '../docs/param-docs'

interface ParamInfoProps {
  docId: string
  label: string
  children: ReactNode
  valueText?: string
}

export function ParamInfo({ docId, label, children, valueText }: ParamInfoProps) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const document = PARAM_DOCS.get(docId)

  return (
    <div className="control-block">
      <div className="control-label-row">
        <label>{label}</label>
        <div className="control-label-actions">
          {valueText && <span className="control-value">{valueText}</span>}
          <button
            type="button"
            className={`info-button ${open ? 'is-open' : ''}`}
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={`About ${label}`}
            onClick={() => setOpen((current) => !current)}
          >
            i
          </button>
        </div>
      </div>
      {children}
      {open && (
        <div className="param-doc" id={panelId} role="note">
          {document ? (
            <>
              <strong>{document.title}</strong>
              <p>{document.physics}</p>
              {document.failureModes.length > 0 && (
                <>
                  <span className="param-doc-heading">Failure modes</span>
                  <ul>{document.failureModes.map((item) => <li key={item}>{item}</li>)}</ul>
                </>
              )}
              {document.compareWith && <p className="compare-note"><span>Compare</span> {document.compareWith}</p>}
              {document.relatedArticle && (
                <a href={`/case-studies/${document.relatedArticle}/`}>Read the related case study →</a>
              )}
            </>
          ) : (
            <p>Documentation for this parameter is being reviewed.</p>
          )}
        </div>
      )}
    </div>
  )
}
