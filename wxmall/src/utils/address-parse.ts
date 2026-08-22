/**
 * 收货地址智能识别（本地启发式，无网络、无第三方依赖）
 * 把「姓名 + 电话 + 地址」混排的一段文本拆成结构化字段。
 * region 输出为「省 市 区」空格连接，与地址表单/后台契约一致；
 * 某字段识别不出时留空，交由用户在表单里手动补全。
 *
 * 覆盖常见格式：
 *   张三 13800138000 广东省深圳市罗湖区春风路1号
 *   广东省深圳市罗湖区春风路1号 张三 13800138000
 *   收货人：张三 手机号码：138... 详细地址：...
 * 不规范输入（缺省份、生僻地名、多地址混排）可能拆不全，属预期。
 */

export interface ParsedAddress {
  name: string
  phone: string
  /** 省 市 区（空格连接） */
  region: string
  detail: string
}

// 34 个省级行政区关键字（短名，仅用于定位地址起点；很小，非完整省市区数据集）
const PROVINCES = [
  '北京', '天津', '上海', '重庆', '河北', '山西', '内蒙古', '辽宁', '吉林', '黑龙江',
  '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南', '湖北', '湖南', '广东',
  '广西', '海南', '四川', '贵州', '云南', '西藏', '陕西', '甘肃', '青海', '宁夏',
  '新疆', '台湾', '香港', '澳门'
]

// 地名/门址常见结尾字：以这些字结尾的短词不当作姓名（降低把楼盘名误判成姓名的概率）
const ADDR_SUFFIX = '省市区县镇乡村路街道号栋座楼室幢层组队苑园厦城堡湾巷弄里场站'

/** 解析一段混排地址文本 */
export function parseAddress(raw: string): ParsedAddress {
  const result: ParsedAddress = { name: '', phone: '', region: '', detail: '' }
  if (!raw) return result

  // 1. 去掉常见标签（长词在前，避免被短词先匹配掉）
  let s = raw.replace(
    /(收货人|收件人|联系人|联系方式|手机号码|手机号|详细地址|收货地址|所在地区|姓名|电话|手机)[:：]?/g,
    ' '
  )
  // 去掉手机号前的国家码
  s = s.replace(/\+?(?:00)?86(?=1[3-9]\d{9})/g, ' ')

  // 2. 抽手机号（容忍空格/横线分隔），并从文本移除
  const phoneMatch = s.match(/1[3-9]\d(?:[-\s]?\d){8}/)
  if (phoneMatch) {
    result.phone = phoneMatch[0].replace(/[-\s]/g, '')
    s = s.replace(phoneMatch[0], ' ')
  }

  // 3. 按分隔符切 token
  const tokens = s.split(/[\s,，、;；]+/).map((t) => t.trim()).filter(Boolean)

  // 4. 分类：第一个像姓名的 token 作为姓名，其余拼成地址串
  const isNameToken = (t: string) =>
    /^[一-龥·]{2,4}$/.test(t) &&
    !PROVINCES.some((p) => t.indexOf(p) === 0) &&
    !ADDR_SUFFIX.includes(t[t.length - 1])

  const addrTokens: string[] = []
  for (const t of tokens) {
    if (!result.name && isNameToken(t)) result.name = t
    else addrTokens.push(t)
  }

  // 5. 从地址串贪心切省/市/区，剩余为详细地址
  const { region, detail } = splitRegion(addrTokens.join(''))
  result.region = region
  result.detail = detail

  return result
}

/** 从地址串贪心切分省/市/区，返回 region（空格连接）与剩余 detail */
function splitRegion(addr: string): { region: string; detail: string } {
  if (!addr) return { region: '', detail: '' }

  // 定位省份起点（省份前可能残留其它字符，如未识别的姓名）
  let start = -1
  for (const p of PROVINCES) {
    const i = addr.indexOf(p)
    if (i !== -1 && (start === -1 || i < start)) start = i
  }
  let head = ''
  let rest = addr
  if (start > 0) {
    head = addr.slice(0, start)
    rest = addr.slice(start)
  }

  const parts: string[] = []
  const take = (re: RegExp) => {
    const m = rest.match(re)
    if (m) {
      parts.push(m[1])
      rest = rest.slice(m[1].length)
    }
  }
  // 省 / 自治区 / 直辖市 / 特别行政区
  take(/^(北京市?|天津市?|上海市?|重庆市?|香港特别行政区|澳门特别行政区|.+?省|.+?自治区)/)
  // 市 / 自治州 / 地区 / 盟
  take(/^(.+?(?:市|自治州|地区|盟))/)
  // 区 / 县 / 县级市 / 旗
  take(/^(.+?(?:区|县|市|旗))/)

  return { region: parts.join(' '), detail: (head + rest).trim() }
}
