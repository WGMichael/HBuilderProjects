/**
 * 图片「先选后传」工具（活动表单与商品编辑共用）
 *
 * 选图时只记本地临时路径，团长最终确认（保存草稿 / 下一步 / 保存商品）时才上传——
 * 中途撤销的图不会白白传到云端。写法参照 wxmall_admin 商品编辑页。
 *
 * 表单里每张图是一个 item：
 *   { file, localPath, preview }
 *   - 已在云端：file = { fileID, url, name, extname }，localPath 为空
 *   - 待上传：  file = null，localPath 为本地临时路径
 * 上传成功后 item 就地改为「已在云端」，保存失败重试时不会重复上传。
 *
 * 云存储路径：活动与活动商品为 {活动创建日期}/{活动ID}/{文件名}，同一场活动的图集中在一个目录；
 * 商品库记录不属于任何活动，为 lib/{上传日期}/{用户ID}/{文件名}。
 * 被替换掉的旧图由云对象在保存成功后按引用情况回收，客户端不删文件。
 */

/** 已入库的 file 值 → item */
export function toItem(file) {
  return { file, localPath: '', preview: (file && file.url) || '' };
}

// ---------------- 选图后压缩 ----------------
// 1M 以内原图；1~3M 轻压；3~8M 重压；8M 以上最重压；压完仍超 5M 拒绝。GIF 不压（会丢动画），只校验上限
const MB = 1024 * 1024;
const LIGHT_OVER = 1 * MB;
const HEAVY_OVER = 3 * MB;
const HEAVIEST_OVER = 8 * MB;
const MAX_SIZE = 5 * MB;
const LIGHT_QUALITY = 0.85;
const HEAVY_QUALITY = 0.7;
const HEAVIEST_QUALITY = 0.5;

// 只收常见位图格式；SVG 可内嵌脚本、HEIC 多数浏览器显示不了，一律不收
const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];

function extOf(name) {
  const m = /\.(\w+)$/.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

/** 是否为允许的图片：H5 优先看 File 的 MIME / 文件名，其余端看临时路径扩展名 */
function isImage(path, f) {
  if (f.type) return IMAGE_MIMES.includes(f.type.toLowerCase());
  const ext = extOf(f.name) || extOf(path);
  if (ext) return IMAGE_EXTS.includes(ext);
  // 判断不了类型：小程序 / App 的 chooseImage 只会给图片，放行；H5 拿不到类型的一律不收
  // #ifdef H5
  return false;
  // #endif
  // #ifndef H5
  return true;
  // #endif
}
// 普通图长边不超 2400；商品详情长图若按长边缩会变窄看不清，允许短边保 1600、长边放宽到 4096（手机 canvas 安全上限）
const MAX_LONG = 2400;
const LONG_IMG_SHORT = 1600;
const LONG_IMG_MAX_LONG = 4096;

/** 目标尺寸缩放比（≤1） */
function scaleOf(w, h) {
  const long = Math.max(w, h);
  const short = Math.min(w, h);
  if (!long || !short) return 1;
  return Math.min(1, Math.max(MAX_LONG / long, Math.min(LONG_IMG_SHORT / short, LONG_IMG_MAX_LONG / long)));
}

function isGif(path, type) {
  return (type && type.indexOf('gif') >= 0) || /\.gif$/i.test(path || '');
}

// #ifdef H5
/** H5：canvas 重绘为 JPEG，返回 { path, size }；失败返回 null */
function compressH5(path, quality) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const s = scaleOf(img.naturalWidth, img.naturalHeight);
        const w = Math.round(img.naturalWidth * s);
        const h = Math.round(img.naturalHeight * s);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        // 先铺白底：透明 PNG 转 JPEG 时透明区域默认会变黑
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => resolve(blob ? { path: URL.createObjectURL(blob), size: blob.size } : null), 'image/jpeg', quality);
      } catch (e) {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = path;
  });
}
// #endif

// #ifndef H5
/** 小程序 / App：uni.compressImage，返回 { path, size }；失败返回 null */
function compressNative(path, quality) {
  return new Promise((resolve) => {
    uni.getImageInfo({
      src: path,
      success: (info) => {
        const s = scaleOf(info.width, info.height);
        uni.compressImage({
          src: path,
          quality: Math.round(quality * 100),
          compressedWidth: Math.round(info.width * s),
          success: (r) => {
            uni.getFileInfo({
              filePath: r.tempFilePath,
              success: (f) => resolve({ path: r.tempFilePath, size: f.size }),
              fail: () => resolve(null),
            });
          },
          fail: () => resolve(null),
        });
      },
      fail: () => resolve(null),
    });
  });
}
// #endif

/** 按大小分档压缩，返回最终本地路径；超上限返回空串 */
async function shrink(path, size, type) {
  if (!size || size <= LIGHT_OVER) return path;
  if (isGif(path, type)) return size <= MAX_SIZE ? path : '';
  const quality = size > HEAVIEST_OVER ? HEAVIEST_QUALITY : size > HEAVY_OVER ? HEAVY_QUALITY : LIGHT_QUALITY;
  let out = null;
  // #ifdef H5
  out = await compressH5(path, quality);
  // #endif
  // #ifndef H5
  out = await compressNative(path, quality);
  // #endif
  // 压缩失败或反而变大时用原图，仍按上限校验
  const best = out && out.size < size ? out : { path, size };
  return best.size <= MAX_SIZE ? best.path : '';
}

/** 选图，返回待上传的 item 列表（非图片过滤；按大小压缩，超 5M 的剔除；两类都提示） */
export function pickImages(count) {
  return new Promise((resolve) => {
    uni.chooseImage({
      count,
      sizeType: ['compressed'],
      // #ifdef H5
      // 只限制系统选择框里可选的类型，用户仍可切到「所有文件」，所以下面还要逐个校验
      extension: IMAGE_EXTS.map((e) => '.' + e),
      // #endif
      success: async (r) => {
        const paths = r.tempFilePaths || [];
        const files = r.tempFiles || [];
        const needWork = files.some((f) => f && f.size > LIGHT_OVER);
        if (needWork) uni.showLoading({ title: '图片处理中', mask: true });
        const items = [];
        let notImage = 0;
        let tooLarge = 0;
        try {
          for (let i = 0; i < paths.length; i++) {
            const f = files[i] || {};
            if (!isImage(paths[i], f)) { notImage++; continue; }
            const p = await shrink(paths[i], f.size, f.type);
            if (p) items.push({ file: null, localPath: p, preview: p });
            else tooLarge++;
          }
        } finally {
          if (needWork) uni.hideLoading();
        }
        const tips = [];
        if (notImage) tips.push(`${notImage} 个非图片文件已忽略`);
        if (tooLarge) tips.push(`${tooLarge} 张图片超过 5M`);
        if (tips.length) uni.showToast({ title: tips.join('，'), icon: 'none', duration: 2500 });
        resolve(items);
      },
      fail: () => resolve([]),
    });
  });
}

function dayOf(ts) {
  const d = new Date(ts || Date.now());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 活动图片目录：YYYY-MM-DD/活动ID/ */
export function imageDir(createDate, activityId) {
  return `${dayOf(createDate)}/${activityId}/`;
}

/** 商品库图片目录：lib/上传日期/用户ID/ */
export function libImageDir() {
  const info = uniCloud.getCurrentUserInfo() || {};
  return `lib/${dayOf()}/${info.uid || 'anonymous'}/`;
}

/** 团长名片头像目录：leader-card/上传日期/用户ID/（D-109）*/
export function leaderCardImageDir() {
  const info = uniCloud.getCurrentUserInfo() || {};
  return `leader-card/${dayOf()}/${info.uid || 'anonymous'}/`;
}

async function uploadOne(localPath, cloudPath) {
  let fileID = '';
  try {
    const res = await uniCloud.uploadFile({ filePath: localPath, cloudPath, cloudPathAsRealPath: true });
    fileID = (res && res.fileID) || '';
  } catch (e) {
    // 支付宝云常见「上传成功却误 reject」（wxmall 实测），按路径拼出 fileID，下面再验证是否真的存在
    const spaceId = uniCloud.config && uniCloud.config.spaceId;
    if (!spaceId) throw e;
    fileID = `cloud://${spaceId}/${cloudPath}`;
  }
  if (!fileID) throw new Error('图片上传失败');

  let url = fileID;
  if (fileID.indexOf('cloud://') === 0) {
    const t = await uniCloud.getTempFileURL({ fileList: [fileID] });
    const it = t && t.fileList && t.fileList[0];
    if (!(it && it.tempFileURL && (!it.code || it.code === 'SUCCESS'))) throw new Error('图片上传失败');
    url = it.tempFileURL;
  }
  const name = cloudPath.slice(cloudPath.lastIndexOf('/') + 1);
  return { fileID, url, name, extname: name.slice(name.lastIndexOf('.') + 1) };
}

/**
 * 把 items 里待上传的图传到 dir 下，就地更新 item。
 * @param {Array} items  item 列表
 * @param {String} dir   imageDir() 的结果
 * @param {String} prefix 文件名前缀，如 cover / img / goods_cover
 */
export async function uploadPending(items, dir, prefix) {
  const ts = Date.now();
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it || !it.localPath) continue;
    const m = /\.(\w+)$/.exec(it.localPath);
    const ext = m ? m[1].toLowerCase() : 'jpg';
    it.file = await uploadOne(it.localPath, `${dir}${prefix}_${ts}_${i}.${ext}`);
    it.localPath = '';
  }
}
