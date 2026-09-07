import type { Language } from '../i18n'
import { translate } from '../i18n'

interface TrustBannerProps {
  language: Language
  onLanguageChange: (language: Language) => void
}

export function TrustBanner({ language, onLanguageChange }: TrustBannerProps) {
  return (
    <header className="trust-header">
      <a className="brand" href="/" aria-label={translate(language, 'home')}>
        <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
        <span>
          <strong>Film Stack</strong>
          <small>Simulator v3</small>
        </span>
      </a>
      <div className="trust-statement">
        <span className="status-dot" aria-hidden="true" />
        <span>{translate(language, 'trust')}</span>
        <a href="/trust/">{translate(language, 'guarantee')} <span aria-hidden="true">↗</span></a>
      </div>
      <div className="header-actions">
        <a className="text-link header-case-link" href="/case-studies/">{translate(language, 'caseStudies')}</a>
        <div className="language-toggle" role="group" aria-label={translate(language, 'language')}>
          <button className={language === 'en' ? 'active' : ''} type="button" onClick={() => onLanguageChange('en')}>EN</button>
          <button className={language === 'zh-TW' ? 'active' : ''} type="button" onClick={() => onLanguageChange('zh-TW')}>繁中</button>
        </div>
      </div>
    </header>
  )
}
