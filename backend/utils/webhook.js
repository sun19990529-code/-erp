/**
 * Webhook 推送工具
 * 支持企业微信群机器人和钉钉群机器人
 * 
 * 配置方式：在 .env 中设置对应的 Webhook URL，留空则不推送
 *   WECHAT_WEBHOOK_URL=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx
 *   DINGTALK_WEBHOOK_URL=https://oapi.dingtalk.com/robot/send?access_token=xxx
 *   DINGTALK_SECRET=SECxxx  (可选，钉钉加签密钥)
 */
const crypto = require('crypto');

const WECHAT_URL = process.env.WECHAT_WEBHOOK_URL || '';
const DINGTALK_URL = process.env.DINGTALK_WEBHOOK_URL || '';
const DINGTALK_SECRET = process.env.DINGTALK_SECRET || '';

// 通知类型 → Emoji 映射
const TYPE_EMOJI = {
  error: '🔴',
  warning: '⚠️',
  success: '✅',
  info: 'ℹ️',
};

/**
 * 推送消息到企业微信群机器人
 */
async function pushToWechat(title, content, type) {
  if (!WECHAT_URL) return;
  const emoji = TYPE_EMOJI[type] || '📢';
  try {
    const resp = await fetch(WECHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgtype: 'markdown',
        markdown: {
          content: `### ${emoji} ${title}\n${content}\n> 来源：铭晟ERP-MES`
        }
      })
    });
    const data = await resp.json();
    if (data.errcode !== 0) {
      console.warn('[webhook/wechat] 推送失败:', data.errmsg);
    }
  } catch (e) {
    console.error('[webhook/wechat] 发送异常:', e.message);
  }
}

/**
 * 钉钉加签计算
 */
function dingtalkSign(timestamp, secret) {
  const str = `${timestamp}\n${secret}`;
  const hmac = crypto.createHmac('sha256', secret).update(str).digest('base64');
  return encodeURIComponent(hmac);
}

/**
 * 推送消息到钉钉群机器人
 */
async function pushToDingtalk(title, content, type) {
  if (!DINGTALK_URL) return;
  const emoji = TYPE_EMOJI[type] || '📢';
  try {
    let url = DINGTALK_URL;
    // 加签模式
    if (DINGTALK_SECRET) {
      const timestamp = Date.now();
      const sign = dingtalkSign(timestamp, DINGTALK_SECRET);
      url += `&timestamp=${timestamp}&sign=${sign}`;
    }
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgtype: 'markdown',
        markdown: {
          title: `${emoji} ${title}`,
          text: `### ${emoji} ${title}\n${content}\n\n---\n*来源：铭晟ERP-MES*`
        }
      })
    });
    const data = await resp.json();
    if (data.errcode !== 0) {
      console.warn('[webhook/dingtalk] 推送失败:', data.errmsg);
    }
  } catch (e) {
    console.error('[webhook/dingtalk] 发送异常:', e.message);
  }
}

/**
 * 统一推送入口 — 同时推送到所有已配置的渠道
 * @param {string} title - 通知标题
 * @param {string} content - 通知内容
 * @param {string} type - 通知类型 error/warning/success/info
 */
async function pushWebhook(title, content, type = 'info') {
  // 并行推送（互不阻塞）
  await Promise.allSettled([
    pushToWechat(title, content, type),
    pushToDingtalk(title, content, type),
  ]);
}

/**
 * 批量推送汇总消息（适用于超期检查等场景）
 * @param {string} title - 汇总标题
 * @param {Array<string>} items - 每条告警的文本
 * @param {string} type - 通知类型
 */
async function pushWebhookBatch(title, items, type = 'warning') {
  if (!items || items.length === 0) return;
  // 合并为一条消息，避免触发频率限制
  const content = items.map((item, i) => `${i + 1}. ${item}`).join('\n');
  const summary = `共 ${items.length} 条告警：\n${content}`;
  await pushWebhook(title, summary, type);
}

module.exports = { pushWebhook, pushWebhookBatch };
