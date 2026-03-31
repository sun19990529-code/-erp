// 用于打印模板预览的示例假数据
// 包括三类：采购入库单(inbound)、销售出库单(outbound)、生产工单(production)
// 注意：不需要定义 index 字段，renderTemplate 会自动生成 {{index}} = idx + 1

export const MOCK_DATA = {
  inbound: {
    order_no: 'IN-20231015-001',
    warehouse_name: '原材料A区总仓',
    supplier_name: '上海精工特钢物资有限公司',
    created_at: '2023-10-15 14:30:00',
    items: [
      { product_code: 'M-304-SUS', product_name: '304不锈钢大管', specification: 'Φ60x3mm', batch_no: 'B23101501', quantity: 500, unit: '公斤', remark: '质检合格' },
      { product_code: 'M-AL-6061', product_name: '6061铝合金棒材', specification: 'Φ40 实心', batch_no: 'B23101502', quantity: 300, unit: '公斤', remark: '免检' },
      { product_code: 'M-CU-T2', product_name: 'T2紫铜带', specification: '厚度0.5mm', batch_no: 'B23101503', quantity: 150, unit: '公斤', remark: '加急入库' },
    ]
  },

  outbound: {
    order_no: 'OUT-20231120-008',
    ref_order_no: 'SO-10293849',
    warehouse_name: '成品智能立体库',
    customer_name: '徐工起重机械事业部',
    created_at: '2023-11-20 09:15:00',
    items: [
      { product_code: 'P-HYD-500', product_name: '重型液压支柱套管', specification: '外径150 内径130 长度2m', batch_no: 'P2311050', quantity: 80, unit: '件' },
      { product_code: 'P-BKT-200', product_name: '高强度连接支架', specification: '标准型 A款', batch_no: 'P2311055', quantity: 150, unit: '件' },
    ]
  },

  production: {
    order_no: 'MO-20231201-002',
    ref_order_no: 'SO-99887766',
    product_name: '精密无缝毛细钢管',
    specification: 'Φ3.0 x 0.5mm 医疗级',
    quantity: 10000,
    unit: '米',
    batch_no: 'PROD-23-12-002',
    created_at: '2023-12-01 08:00:00',
    processes: [
      { sequence: 1, process_name: '备料拉拔', remark: '需注意冷拔变形量，不超过30%' },
      { sequence: 2, process_name: '真空退火', remark: '保温2小时，随炉冷却' },
      { sequence: 3, process_name: '超声波清洗', remark: '清除表面残油' },
      { sequence: 4, process_name: '涡流探伤', remark: '100%全检，不允许微弱裂纹' },
      { sequence: 5, process_name: '打包入库', remark: '按每捆100米包装，防止弯折' },
    ]
  }
};
