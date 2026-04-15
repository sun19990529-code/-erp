/**
 * 复合条码智能解析器 (Barcode / QR Code Parser)
 * 专为制造业复杂的物料标签设计，支持将冗长的二维码字符串瞬间反序列化为业务对象。
 */

export const parseBarcode = (rawCodeString) => {
  if (!rawCodeString || typeof rawCodeString !== 'string') {
    return { type: 'unknown', raw: rawCodeString };
  }

  // 安全校验：防止超长恶意输入卡顿解析 (#10)
  if (rawCodeString.length > 2048) {
    console.warn('[barcodeParser] 条码长度超限，已截断:', rawCodeString.length);
    rawCodeString = rawCodeString.substring(0, 2048);
  }

  // 1. 尝试使用标准的工业 4.0 JSON 协议解析
  // (例如我们在系统标签打印阶段植入的格式)
  try {
    const startIdx = rawCodeString.indexOf('{');
    const endIdx = rawCodeString.lastIndexOf('}');
    
    if (startIdx !== -1 && endIdx !== -1 && startIdx < endIdx) {
      const jsonStr = rawCodeString.substring(startIdx, endIdx + 1);
      const parsed = JSON.parse(jsonStr);
      
      // 我们在实施计划中约定的复合条码协议
      if (parsed.type === 'composite') {
        return {
          type: 'composite',
          product_code: parsed.product_code || '',
          batch_no: parsed.batch_no || '',
          heat_no: parsed.heat_no || '',
          quantity: parseFloat(parsed.quantity) || null, // 可能是 null
          unit: parsed.unit || '',
          supplier_batch_no: parsed.supplier_batch_no || '',
          source_order: parsed.source_order || '',
          raw: rawCodeString
        };
      }
      
      // 旧版基础产品协议兼容
      if (parsed.type === 'product') {
        return {
          type: 'product',
          product_code: parsed.id || '',
          raw: rawCodeString
        };
      }
    }
  } catch (err) {
    // 静默失败，转入下一种解析规则
  }

  // 2. 匹配管材标签上的管道定界符协议 (| 分隔)
  // 规则预设: COMP|物料编号|内部批次|炉号|重量
  // 例如: COMP|MAT-TUBE|B2026|HT-1234|135.5
  if (rawCodeString.startsWith('COMP|')) {
    const parts = rawCodeString.split('|');
    return {
      type: 'composite',
      product_code: parts[1] || '',
      batch_no: parts[2] || '',
      heat_no: parts[3] || '',
      quantity: parts[4] ? parseFloat(parts[4]) : null,
      raw: rawCodeString
    };
  }

  // 3. 原生单据识别兜底
  if (rawCodeString.startsWith('PO-')) {
    return { type: 'production_order', id: rawCodeString, raw: rawCodeString };
  }
  if (rawCodeString.startsWith('IN-')) {
    return { type: 'inbound_order', id: rawCodeString, raw: rawCodeString };
  }
  const wsMatch = rawCodeString.match(/\/ws\/([A-Za-z0-9_-]+)/);
  if (wsMatch) {
    return { type: 'workstation', station_id: wsMatch[1], raw: rawCodeString };
  }

  // 4. 全部不匹配，当作最原生的单维文本材料编码
  return {
    type: 'raw_material',
    product_code: rawCodeString,
    raw: rawCodeString
  };
};
