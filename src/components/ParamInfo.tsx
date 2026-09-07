import { useId, useState, type ReactNode } from 'react'
import { getParamDoc } from '../docs/param-docs'
import { translate, type Language } from '../i18n'

interface ParamInfoProps {
  docId: string
  label: string
  children: ReactNode
  valueText?: string
  language: Language
}

export function ParamInfo({ docId, label, children, valueText, language }: ParamInfoProps) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const document = getParamDoc(docId, language)

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
            aria-label={translate(language, 'aboutParameter', { label })}
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
                  <span className="param-doc-heading">{translate(language, 'failureModes')}</span>
                  <ul>{document.failureModes.map((item) => <li key={item}>{item}</li>)}</ul>
                </>
              )}
              {document.compareWith && <p className="compare-note"><span>{translate(language, 'compareLabel')}</span> {document.compareWith}</p>}
              {document.relatedArticle && (
                <a href={`/case-studies/${document.relatedArticle}/`}>{translate(language, 'relatedCaseStudy')}</a>
              )}
            </>
          ) : (
            <p>{translate(language, 'docsReviewing')}</p>
          )}
        </div>
      )}
    </div>
  )
}
