/**
 * 单据模板打印引擎 (Print Engine) v2
 * 职责：获取模板HTML → 数据字段映射适配 → 正则变量/循环替换 → iframe 静默打印
 */

import { apiRequest } from '../api';

/**
 * 对正则特殊字符进行转义，防止变量名包含 . $ * 等字符时匹配出错
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 将数据绑定到 HTML 模板上
 * 支持简单变量（例如：{{order_no}}）
 * 支持表格列表循环（例如：<!-- LOOP_ITEMS_START -->...<!-- LOOP_ITEMS_END -->）
 * @param {string} htmlTemplate
 * @param {Object} data 单据主数据与明细数组
 * @returns {string} 渲染后的纯HTML字符串
 */
export function renderTemplate(htmlTemplate, data) {
  let result = htmlTemplate;

  // 1. 处理数组循环块 (items, processes 等)
  const processLoop = (loopName, arrayData) => {
    const startTag = `<!-- LOOP_${loopName}_START -->`;
    const endTag = `<!-- LOOP_${loopName}_END -->`;
    const startIndex = result.indexOf(startTag);
    const endIndex = result.indexOf(endTag);

    if (startIndex !== -1 && endIndex !== -1 && arrayData && Array.isArray(arrayData)) {
      const loopBlock = result.substring(startIndex + startTag.length, endIndex);
      let renderedBlock = '';

      arrayData.forEach((item, idx) => {
        let rowHtml = loopBlock;
        // {{index}} 自动自增编号
        rowHtml = rowHtml.replace(/\{\{index\}\}/g, idx + 1);

        // 替换行内的所有变量
        Object.keys(item).forEach(key => {
          const regex = new RegExp(`\\{\\{${escapeRegex(key)}\\}\\}`, 'g');
          rowHtml = rowHtml.replace(regex, item[key] == null ? '' : item[key]);
        });

        // 残余未匹配的替换成空
        rowHtml = rowHtml.replace(/\{\{[a-zA-Z0-9_]+\}\}/g, '');
        renderedBlock += rowHtml;
      });

      result = result.substring(0, startIndex) + renderedBlock + result.substring(endIndex + endTag.length);
    }
  };

  processLoop('ITEMS', data.items);
  if (data.processes) {
    processLoop('PROCESSES', data.processes);
  }

  // 2. 替换顶层简单占位变量
  Object.keys(data).forEach(key => {
    if (typeof data[key] !== 'object') {
      const regex = new RegExp(`\\{\\{${escapeRegex(key)}\\}\\}`, 'g');
      result = result.replace(regex, data[key] == null ? '' : data[key]);
    }
  });

  // 3. 清理残余占位符
  result = result.replace(/\{\{[a-zA-Z0-9_]+\}\}/g, '');

  return result;
}

/**
 * 将业务接口返回的数据结构适配为模板引擎所需的标准化格式
 * 解决 API 字段名 (code/name) 与模板占位符 (product_code/product_name) 不匹配的问题
 */
function normalizeData(type, rawData) {
  const base = { ...rawData };

  // 入库/出库单：items 数组字段映射
  if ((type === 'inbound' || type === 'outbound') && rawData.items) {
    base.items = rawData.items.map((item, idx) => ({
      index: idx + 1,
      product_code: item.code || item.product_code || '',
      product_name: item.name || item.product_name || '',
      specification: item.specification || '',
      batch_no: item.batch_no || 'DEFAULT_BATCH',
      quantity: item.input_quantity || item.quantity || 0,
      unit: item.input_unit || item.unit || '公斤',
      remark: item.remark || '',
      supplier_batch_no: item.supplier_batch_no || '',
      heat_no: item.heat_no || '',
    }));
  }

  // 生产工单：processRecords → processes 数组映射
  if (type === 'production') {
    // API 返回的是 processRecords，模板期望的是 processes
    if (rawData.processRecords && !rawData.processes) {
      base.processes = rawData.processRecords.map((r, idx) => ({
        sequence: idx + 1,
        process_name: r.process_name || '',
        remark: r.remark || '',
        operator: r.operator || '',
        status: r.status || '',
      }));
    }
  }

  return base;
}

/**
 * 加载打印模板
 * @param {string} type - 单据类型 (inbound, outbound, production)
 * @param {number} [templateId] - 可选，强制使用特定ID的模板
 */
export async function fetchTemplate(type, templateId = null) {
  try {
    const url = templateId
      ? `/print-templates/${templateId}`
      : `/print-templates/default/${type}`;

    const result = await apiRequest(url);
    if (result.success && result.data) {
      return result.data.content;
    }
    throw new Error(result.message || '获取打印模板内容失败');
  } catch (err) {
    console.error('打印模板加载失败:', err);
    throw err;
  }
}

/**
 * 发起实际打印动作
 * 获取远端模板 → 数据格式适配 → 模板变量替换 → iframe 静默打印
 * @param {string} type
 * @param {Object} data
 * @param {number} [templateId]
 */
export async function doPrint(type, data, templateId = null) {
  try {
    const templateContent = await fetchTemplate(type, templateId);

    // 适配数据字段名
    const normalizedData = normalizeData(type, data);

    // 渲染模板
    const finalHtml = renderTemplate(templateContent, normalizedData);

    // 创建静默 iframe 打印容器
    let printIframe = document.getElementById('print-engine-iframe');
    if (!printIframe) {
      printIframe = document.createElement('iframe');
      printIframe.id = 'print-engine-iframe';
      printIframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:none;';
      document.body.appendChild(printIframe);
    }

    const iframeDoc = printIframe.contentWindow.document;
    iframeDoc.open();
    iframeDoc.write(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>文档打印</title></head><body>${finalHtml}</body></html>`);
    iframeDoc.close();

    // 延时确保渲染完成后再触发打印
    setTimeout(() => {
      printIframe.contentWindow.focus();
      printIframe.contentWindow.print();
      // 打印完成后清理 iframe，避免内存泄漏和样式污染
      setTimeout(() => {
        if (printIframe.parentNode) {
          printIframe.parentNode.removeChild(printIframe);
        }
      }, 2000);
    }, 500);

  } catch (error) {
    alert('打印发生错误: ' + error.message);
  }
}
