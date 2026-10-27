/**
 * 分享海报绘制（D-102、D-117，仅 H5）
 *
 * 用浏览器原生 canvas 在内存里画一张竖版海报，返回 PNG 的 dataURL，由 go-poster 以原生 <img> 展示，
 * 用户在微信里长按即可保存或发送；二维码内容是活动页的 H5 链接（与「复制链接」同一地址，D-095）。
 * 微信小程序版本应换成小程序码（需 AppID 与服务端接口，OPEN_ISSUES §3.5），本模块届时只改二维码来源。
 *
 * 封面图跨域：先直接加载（云存储开放跨域时可用）；失败则调用方提供的 loadCoverData
 * （云端 activityPosterCover 代下载为 dataURL）再画；仍失败才用默认头图。
 */
import qrcode from '../vendor/qrcode.js';

const W = 750; // 逻辑宽度；按 2 倍像素绘制，保存后在手机上也清晰
const SCALE = 2;
const PAD = 40; // 卡片内边距
const CARD_X = 30;
const CARD_W = W - CARD_X * 2;
const INNER_W = CARD_W - PAD * 2;
const FONT = '-apple-system, "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif';
const C = { primary: '#168a55', ink: '#17231d', text: '#4b5650', muted: '#6f7974', line: '#e3e9e5', red: '#c7463f', canvas: '#eef2ef' };
const IMG_TIMEOUT = 8000;

const fmtFull = (ts) => {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

function loadImage(src) {
  return new Promise((resolve, reject) => {
    if (!src) return reject(new Error('no src'));
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => reject(new Error('timeout')), IMG_TIMEOUT);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error('load failed')); };
    img.src = src;
  });
}

/** 按宽度折行，最多 maxLines 行，超出的最后一行加省略号 */
function wrapText(ctx, text, width, maxLines) {
  const lines = [];
  let line = '';
  const chars = Array.from(String(text || ''));
  for (let i = 0; i < chars.length; i++) {
    const test = line + chars[i];
    if (ctx.measureText(test).width > width && line) {
      if (lines.length === maxLines - 1) {
        let cut = line;
        while (cut && ctx.measureText(cut + '…').width > width) cut = cut.slice(0, -1);
        lines.push(cut + '…');
        return lines;
      }
      lines.push(line);
      line = chars[i];
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function ellipsis(ctx, text, width) {
  return wrapText(ctx, text, width, 1)[0] || '';
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 二维码直接画模块，不经图片，避免再次跨域 */
function drawQr(ctx, text, x, y, size) {
  qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const cell = size / n;
  ctx.fillStyle = '#fff';
  ctx.fillRect(x - 12, y - 12, size + 24, size + 24);
  ctx.fillStyle = '#000';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      // 向上取整并多画 0.5 像素，避免模块之间出现细缝
      if (qr.isDark(r, c)) ctx.fillRect(x + c * cell, y + r * cell, Math.ceil(cell) + 0.5, Math.ceil(cell) + 0.5);
    }
  }
}

/** 封面按 cover 方式裁切铺满 */
function drawCover(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

/**
 * 版式（D-117）：顶部一行「标题（单行，过长省略）+ 截止时间」，下面整幅封面（按原图比例，限制在 16:9～4:5 之间裁切），
 * 底部二维码、活动码与免责提示。不列商品、不写交付方式与开始时间。没有封面时画主色头图。
 */
function render(data, cover) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // —— 先量高度 ——
  const TOP_H = 92;
  let coverH = 300;
  if (cover) {
    const ratio = Math.min(1.25, Math.max(0.5625, cover.height / cover.width));
    coverH = Math.round(INNER_W * ratio);
  }
  const QR = 200;
  const cardH = TOP_H + coverH + PAD + QR + PAD;
  const H = CARD_X * 2 + cardH;

  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = 'middle';

  // —— 底与卡片 ——
  ctx.fillStyle = C.canvas;
  ctx.fillRect(0, 0, W, H);
  roundRect(ctx, CARD_X, CARD_X, CARD_W, cardH, 24);
  ctx.fillStyle = '#fff';
  ctx.fill();

  const x = CARD_X + PAD;
  let y = CARD_X;

  // —— 标题 + 截止时间（同一行）——
  const endText = data.endTime ? '截止 ' + fmtFull(data.endTime) : '';
  ctx.font = `24px ${FONT}`;
  const endW = endText ? ctx.measureText(endText).width : 0;
  ctx.fillStyle = C.muted;
  if (endText) ctx.fillText(endText, x + INNER_W - endW, y + TOP_H / 2);
  ctx.font = `bold 36px ${FONT}`;
  ctx.fillStyle = C.ink;
  ctx.fillText(ellipsis(ctx, data.title, INNER_W - endW - (endText ? 24 : 0)), x, y + TOP_H / 2);
  y += TOP_H;

  // —— 封面 ——
  ctx.save();
  roundRect(ctx, x, y, INNER_W, coverH, 16);
  ctx.clip();
  if (cover) {
    drawCover(ctx, cover, x, y, INNER_W, coverH);
  } else {
    const g = ctx.createLinearGradient(x, y, x + INNER_W, y + coverH);
    g.addColorStop(0, '#1d9b62');
    g.addColorStop(1, '#0f6b41');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, INNER_W, coverH);
    ctx.fillStyle = '#fff';
    ctx.font = `bold 52px ${FONT}`;
    ctx.fillText('群接龙', x + 40, y + coverH / 2 - 24);
    ctx.font = `26px ${FONT}`;
    ctx.globalAlpha = 0.85;
    ctx.fillText('点开即可选购登记', x + 40, y + coverH / 2 + 36);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  y += coverH + PAD;

  // —— 二维码与引导 ——
  ctx.textBaseline = 'top';
  drawQr(ctx, data.url, x + 12, y, QR);
  const tx = x + QR + 56;
  const tw = INNER_W - QR - 56;
  ctx.fillStyle = C.ink;
  ctx.font = `bold 32px ${FONT}`;
  ctx.fillText('长按识别二维码', tx, y + 30);
  ctx.fillStyle = C.primary;
  ctx.font = `28px ${FONT}`;
  ctx.fillText('进入接龙选购', tx, y + 80);
  let ny = y + 134;
  // 活动码（D-104）：扫不了码时可在「我参与的」按码查找
  if (data.shortCode) {
    ctx.fillStyle = C.ink;
    ctx.font = `bold 24px ${FONT}`;
    ctx.fillText('活动码 ' + data.shortCode, tx, y + 122);
    ny = y + 160;
  }
  ctx.fillStyle = C.muted;
  ctx.font = `22px ${FONT}`;
  for (const l of wrapText(ctx, '接龙成功不代表已付款，费用与交付由团长线下处理', tw, 2)) { ctx.fillText(l, tx, ny); ny += 32; }

  return canvas.toDataURL('image/png');
}

/**
 * @param {object} data { title, coverUrl, endTime, url, shortCode, loadCoverData? }
 *   loadCoverData：可选，返回封面 dataURL 的异步函数（云端代下载，D-117）；直接加载封面跨域失败时调用
 * @returns {Promise<{ dataUrl: string, withCover: boolean }>}
 */
export async function drawPoster(data) {
  // 1) 直接加载封面（云存储开放了跨域时最快）
  if (data.coverUrl) {
    try {
      const cover = await loadImage(data.coverUrl);
      return { dataUrl: render(data, cover), withCover: true };
    } catch (e) {
      // 加载失败或画布被污染（跨域）：走云端代下载
    }
  }
  // 2) 云端代下载为 dataURL：同源数据，不受跨域限制
  if (data.coverUrl && data.loadCoverData) {
    try {
      const dataUrl = await data.loadCoverData();
      if (dataUrl) {
        const cover = await loadImage(dataUrl);
        return { dataUrl: render(data, cover), withCover: true };
      }
    } catch (e) {
      console.warn('[poster] 封面代下载失败，改为默认头图', e);
    }
  }
  return { dataUrl: render(data, null), withCover: !data.coverUrl };
}
