export type Language = 'en' | 'zh-TW'

const messages = {
  en: {
    trust: '100% client-side · no data leaves your browser · no ads · no tracking',
    guarantee: 'How we guarantee this',
    flow: 'Process flow', layout: 'Top-down layout', library: 'My stacks',
    crossSection: '2D cross-section', threeView: '3D view', finalState: 'Final state',
    storedOnly: 'Your stacks are stored in this browser only. Clearing browser data will delete them — export a JSON file to keep a copy.',
    exportJson: 'Export JSON', importJson: 'Import', share: 'Copy share link', saveCopy: 'Save a copy',
    resumeTitle: 'Resume your last session?', resumeBody: 'A local draft from this browser is available.',
    resume: 'Resume session', startFresh: 'Start fresh', caseStudies: 'Case studies',
  },
  'zh-TW': {
    trust: '100% 在瀏覽器端執行 · 資料不會離開瀏覽器 · 無廣告 · 無追蹤',
    guarantee: '查看我們如何保證',
    flow: '製程流程', layout: '俯視版圖', library: '我的堆疊',
    crossSection: '2D 剖面', threeView: '3D 視圖', finalState: '最終狀態',
    storedOnly: '你的堆疊只儲存在這個瀏覽器。清除瀏覽器資料會一併刪除；請匯出 JSON 留存副本。',
    exportJson: '匯出 JSON', importJson: '匯入', share: '複製分享連結', saveCopy: '另存副本',
    resumeTitle: '繼續上次工作？', resumeBody: '這個瀏覽器中有一份本機草稿。',
    resume: '繼續工作', startFresh: '從空白開始', caseStudies: '案例文章',
  },
} as const

export type MessageKey = keyof typeof messages.en

export function translate(language: Language, key: MessageKey): string {
  return messages[language][key]
}
