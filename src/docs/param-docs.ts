export interface ParamDoc {
  id: string
  title: string
  physics: string
  failureModes: string[]
  compareWith?: string
  relatedArticle?: string
}

type TranslatedParamDoc = Pick<ParamDoc, 'title' | 'physics' | 'failureModes' | 'compareWith'>

function parseFrontMatter(markdown: string): { metadata: Record<string, string>; body: string } {
  if (!markdown.startsWith('---\n')) return { metadata: {}, body: markdown }
  const end = markdown.indexOf('\n---\n', 4)
  if (end < 0) return { metadata: {}, body: markdown }
  const metadata = Object.fromEntries(
    markdown.slice(4, end).split('\n').map((line) => {
      const separator = line.indexOf(':')
      return separator > 0 ? [line.slice(0, separator).trim(), line.slice(separator + 1).trim()] : [line.trim(), '']
    }),
  )
  return { metadata, body: markdown.slice(end + 5) }
}

function section(body: string, heading: string): string {
  const expression = new RegExp(`^## ${heading}\\s*\\n([\\s\\S]*?)(?=^## |$)`, 'mi')
  return expression.exec(body)?.[1]?.trim() ?? ''
}

function cleanInline(markdown: string): string {
  return markdown.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim()
}

function parseParamDoc(markdown: string): ParamDoc {
  const { metadata, body } = parseFrontMatter(markdown)
  const failures = section(body, 'Failure modes')
    .split('\n')
    .filter((line) => /^[-*]\s+/u.test(line))
    .map((line) => cleanInline(line.replace(/^[-*]\s+/u, '')))
  return {
    id: metadata.id ?? '',
    title: metadata.title ?? metadata.id ?? 'Parameter',
    physics: cleanInline(section(body, 'Physical meaning')),
    failureModes: failures,
    compareWith: cleanInline(section(body, 'Compare with')) || undefined,
    relatedArticle: metadata.relatedArticle || undefined,
  }
}

const sources = import.meta.glob('./params/*.md', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>
const documents = Object.values(sources).map(parseParamDoc).filter((document) => document.id)

export const PARAM_DOCS = new Map(documents.map((document) => [document.id, document]))

const ZH_TW_PARAM_DOCS: Record<string, TranslatedParamDoc> = {
  'base.thickness': {
    title: '起始膜層厚度',
    physics: '設定任何製程執行前，起始材料膜層的垂直尺寸（nm）。網格以整格表示，因此可見厚度會依網格尺寸量化，不是連續膜厚量測。',
    failureModes: ['膜層過薄時，可能被蝕刻完全消耗並露出下層。', '膜層過厚時，可能把其他介面推離可見網格，或留下超出預期的材料。'],
    compareWith: '固定材料與所有步驟，比較一半與兩倍厚度，以隔離起始堆疊幾何的影響。',
  },
  'deposition.material': {
    title: '沉積材料',
    physics: '指定新佔用網格的材料 ID 與固定色彩。材料身分會影響後續選擇性蝕刻，但模擬器不會從名稱推算密度、應力、化學、導電性或沉積速率。',
    failureModes: ['材料選錯可能使後續選擇性蝕刻保留沉積區，或移除錯誤區域。', '用同一材料 ID 表示物理性質不同的薄膜，可能隱藏重要介面。'],
    compareWith: '固定幾何，只改變材料身分，再檢查後續材料選擇性蝕刻的反應。',
  },
  'deposition.mode': {
    title: '沉積模式',
    physics: '選擇幾何覆蓋規則：等向覆蓋會擴張暴露表面，方向性模式偏向面對來源的表面，間隙填充優先佔據可到達的空洞。這些是輪廓演變的教學抽象，不是 CVD、PVD、ALD 或回流反應模型。',
    failureModes: ['方向性覆蓋可能使側壁或底部不連續，並在開口附近形成懸垂。', '等向或間隙填充可能縮窄或封閉開口；簡化的填充規則可能比實際製程更理想。'],
    compareWith: '使用相同材料與名目厚度，重播三種模式，以區分覆蓋規則與劑量影響。',
  },
  'deposition.thicknessNm': {
    title: '沉積厚度',
    physics: '沉積步驟名目增加的幾何量（nm）。模式會把此量分配至暴露表面，網格再將結果取整；它不是沉積時間或經校準的每循環成長量。',
    failureModes: ['材料太少可能造成底部或側壁覆蓋不完整。', '材料太多可能縮窄開口、形成懸垂，或過早封閉間隙。'],
    compareWith: '固定材料、模式與網格解析度，比較一半、名目與兩倍厚度。',
  },
  'deposition.sidewallFactor': {
    title: '方向性側壁係數',
    physics: '在方向性模式中，以此無因次係數縮放垂直側壁相對於朝向來源之水平表面的沉積量。較小值代表較差的側壁覆蓋；它是幾何控制，不是擬合的角度通量分布。',
    failureModes: ['低係數可能在頂部看似足夠時，仍留下不連續側壁或阻障層。', '高係數可能讓方向性製程看起來近似等向，並高估深開口內的覆蓋。'],
    compareWith: '固定名目厚度與版圖，在方向性模式比較低係數與 1.0，再與等向覆蓋結果比較。',
  },
  'etch.target': {
    title: '蝕刻目標材料',
    physics: '指定幾何蝕刻規則以名目量移除的材料；其他材料只會依選擇比移除。材料名稱不會選擇電漿化學或計算反應產物。',
    failureModes: ['目標選錯可能保留預定薄膜，卻侵蝕遮罩、間隔層或停止層。', '選定切面沒有目標材料時，步驟可能看似沒有作用。'],
    compareWith: '深度不變，改選預定薄膜與遮罩或停止層，確認材料指派符合製程敘事。',
  },
  'etch.mask': {
    title: '蝕刻遮罩來源',
    physics: '「版圖」只允許從俯視圖形取樣到的開口移除材料；「全面」則允許所有暴露位置移除。此切換只選擇幾何遮罩來源，不模擬光阻成像、焦距曝光或遮罩侵蝕。',
    failureModes: ['全面蝕刻可能移除預定圖形開口以外的材料。', '版圖模式若切面或圖形可見性錯誤，可能保護整個剖面或暴露錯誤區域。'],
    compareWith: '使用相同目標與深度，分別以版圖遮罩和全面蝕刻重播。',
  },
  'etch.depthNm': {
    title: '名目蝕刻深度',
    physics: '幾何負載與選擇比修正前，要求的名目垂直移除距離（nm）。它不是蝕刻時間乘以實測速率，最後深度也會依網格量化。',
    failureModes: ['深度不足會留下目標材料殘留或未開啟圖形。', '深度過大會增加遮罩或停止層暴露，並消耗原有幾何裕度。'],
    compareWith: '固定目標、選擇比、遮罩與 ARDE 係數，以較淺和較深數值包夾剛好清除的位置。',
  },
  'etch.selectivity': {
    title: '蝕刻選擇比',
    physics: '以目標材料移除速率除以其他材料移除速率表示。較大比值在相同名目移除量下更能保留非目標材料；此值是輸入，不會從化學或表面狀態計算。',
    failureModes: ['低選擇比可能在目標清除前先消耗遮罩或停止層。', '把極高輸入視為物理保證，可能隱藏實際製程中重要的微量非目標損失。'],
    compareWith: '固定目標與名目深度，比較 1:1 與高選擇比。',
  },
  'etch.ardeFactor': {
    title: 'ARDE 係數',
    physics: '此無因次幾何負載項會依要求蝕刻深度與取樣開口寬度降低移除量；設為零會停用。它是精簡教學控制，不會在步驟中演化深寬比，也不分別求解傳輸、充電、鈍化或產物排出。',
    failureModes: ['大係數可能使深窄圖形未清除，而寬圖形已達要求深度。', '以單一結構擬合後當成可轉移配方參數，會造成錯誤的預測信心。'],
    compareWith: '先以 0 作為控制，再固定開口、名目深度與選擇比逐步增加係數。',
  },
  'etch.overlayNm': {
    title: '遮罩套刻偏移',
    physics: '在取樣遮罩與下方結構間施加橫向位移（nm），正負號依模擬器 X 軸定義。這是確定性偏移，不是統計套刻分布或完整二維變形圖。',
    failureModes: ['Via 或接觸孔偏移會降低落點面積並暴露周圍介電層。', '線條或切割遮罩偏移會在名目 CD 不變時產生不對稱邊距。'],
    compareWith: '固定 Via、線條與遮罩尺寸，從零向正負方向掃描相同偏移量。',
  },
  'layout.cutPosition': {
    title: '剖面切面位置',
    physics: '這是用來產生權威 2D 剖面的正規化俯視 Y 座標。移動它會改變切面與哪些版圖多邊形相交；不會移動多邊形，也不代表晶圓級製程變異。',
    failureModes: ['切面位於圖形外時，圖案化步驟可能看似全面或空白。', '切過邊緣可能放大細小套刻或網格化差異，形成不具代表性的剖面。'],
    compareWith: '固定流程，將切面移過同一圖形的中心與邊緣。',
  },
  'planarize.targetHeightNm': {
    title: '平坦化目標高度',
    physics: '簡化平坦化步驟後保留的絕對剖面高度；高於此高度的已佔用網格會被移除。此操作是完全平坦的幾何裁切，不計算研磨速率、選擇比、碟陷、侵蝕或圖形密度效應。',
    failureModes: ['目標太高會留下預定表面上方的多餘材料。', '目標太低會移除功能材料，外觀可能像過度研磨但沒有對應物理模型。'],
    compareWith: '固定進入步驟前的地形，以一高一低的目標包夾預定表面。',
  },
  'sadp.mandrelPitchNm': {
    title: 'SADP Mandrel 間距',
    physics: 'Spacer 形成前，犧牲模板中心到中心的重複距離。變更後會重新產生週期性俯視 Mandrel 多邊形，再由 2D 引擎於切面取樣實際邊緣。最終等間距仍同時取決於 Mandrel 線寬與 Spacer 厚度。',
    failureModes: ['相對所選線寬而言間距太小，可能封閉相鄰 Spacer 之間的空間。', '只改間距而未重新設定線寬，會讓兩組交替間隙不相等。'],
    compareWith: '固定 Mandrel 線寬與 Spacer 厚度改變間距，再調整線寬以恢復對稱控制。',
  },
  'sadp.mandrelWidthNm': {
    title: 'SADP Mandrel 線寬',
    physics: '側壁 Spacer 留下前，每個犧牲核心的幾何 CD。它控制兩組交替自由空間之一，因此即使 Spacer 厚度一致，線寬誤差仍可能在倍頻後表現為位置誤差。',
    failureModes: ['線寬偏差會讓原 Mandrel 間隙與 Mandrel 之間的間隙交替變大變小。', '極端線寬可能使所選間距內無法形成有效 Spacer／空間結構。'],
    compareWith: '固定間距、Spacer 厚度與 pitch walk，在名目值上下掃描線寬。',
  },
  'sadp.spacerThicknessNm': {
    title: 'SADP Spacer 厚度',
    physics: '設定簡化 SADP 結構中側壁衍生線條的橫向寬度。實際共形薄膜與非等向蝕刻都會影響最終 Spacer CD，但此輸入只代表其淨幾何結果。',
    failureModes: ['過薄 Spacer 會形成狹窄轉移遮罩，並放大網格量化。', '過厚 Spacer 可能耗盡可用間隙並合併相鄰區域。'],
    compareWith: '固定 Mandrel 間距與線寬，且 pitch walk 為零，比較薄、名目與厚 Spacer。',
  },
  'sadp.spacerHeightNm': {
    title: 'SADP Spacer 高度',
    physics: '設定剖面中側壁遮罩的垂直高度，並與橫向厚度獨立。模擬器不計算錐度、機械穩定性或蝕刻預算造成的高度損失。',
    failureModes: ['過短 Spacer 可能無法為後續轉移提供足夠幾何遮罩高度。', '很高且狹窄的 Spacer 在模型中可能看似穩定，但實際倒塌或變形需要額外物理模型。'],
    compareWith: '固定橫向 Spacer 厚度與後續轉移深度，只改變高度。',
  },
  'sadp.pitchWalkNm': {
    title: 'SADP 間距偏移',
    physics: '直接施加交替邊緣位移（nm）以示範 pitch walking。它是可觀察的幾何輸入，不是由特定 Mandrel、沉積或蝕刻機制計算的結果。',
    failureModes: ['非零位移會形成交替間隙並消耗後續邊緣位置裕度。', '位移接近可用半空間時可能造成線條重疊或間隙消失，超出合理擾動研究範圍。'],
    compareWith: '以 0 作為對稱控制，固定其他 SADP 尺寸，比較等量正負位移。',
  },
}

export function getParamDoc(id: string, language: 'en' | 'zh-TW'): ParamDoc | undefined {
  const document = PARAM_DOCS.get(id)
  if (!document || language === 'en') return document
  const translated = ZH_TW_PARAM_DOCS[id]
  return translated ? { ...document, ...translated } : document
}
