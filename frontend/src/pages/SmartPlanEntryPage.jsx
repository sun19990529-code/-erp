import React, { useState, useEffect } from 'react';
import Decimal from 'decimal.js';
import { api } from '../api';

// 淄博海泰与达克尔的5张单据静态模拟提取库 (供用户快速模拟体验AI提取)
const SIMULATED_TICKETS = {
  '0001305': {
    order_no: 'MLSHP-260004',
    customer_name: '达克尔',
    steel_type: 'SUS 304',
    heat_no: '5620202',
    raw_material: {
      outer_diameter: '19.3',
      wall_thickness: '1.25',
      length: '2000',
      quantity_kg: '200'
    },
    finished_product: {
      outer_diameter: '18.2',
      inner_diameter: '16.0',
      wall_thickness: '1.10',
      length: '369.5',
      quantity_kg: '180'
    },
    rows: [
      { outer_diameter: '19.3', wall_thickness: '1.25', length: '2000', cold_rolling: '1', cold_drawing: '', oiling: '', annealing: '', straightening: '', cutting: '', inspection: '' },
      { outer_diameter: '18.3', wall_thickness: '1.15', length: '369.5', cold_rolling: '', cold_drawing: '', oiling: '2', annealing: '3', straightening: '4', cutting: '5', inspection: '6' }
    ]
  },
  '0001302': {
    order_no: 'FM-260527-01',
    customer_name: '淄博海泰',
    steel_type: 'Ni 52',
    heat_no: '5601201',
    raw_material: {
      outer_diameter: '6.0',
      wall_thickness: '0.55',
      length: '1800',
      quantity_kg: '90'
    },
    finished_product: {
      outer_diameter: '3.3',
      inner_diameter: '2.25',
      wall_thickness: '0.525',
      length: '1800',
      quantity_kg: '85'
    },
    rows: [
      { outer_diameter: '6.0', wall_thickness: '0.55', length: '1800', cold_rolling: '1', cold_drawing: '', oiling: '', annealing: '', straightening: '', cutting: '', inspection: '' },
      { outer_diameter: '5.0', wall_thickness: '0.50', length: '2400', cold_rolling: '', cold_drawing: '', oiling: '2', annealing: '3', straightening: '', cutting: '', inspection: '' },
      { outer_diameter: '4.0', wall_thickness: '0.45', length: '3000', cold_rolling: '', cold_drawing: '4', oiling: '7', annealing: '8', straightening: '5', cutting: '6', inspection: '' },
      { outer_diameter: '3.3', wall_thickness: '0.525', length: '1800', cold_rolling: '', cold_drawing: '', oiling: '', annealing: '', straightening: '', cutting: '', inspection: '9' }
    ]
  },
  '0001303': {
    order_no: 'FM-260527-02',
    customer_name: '淄博海泰',
    steel_type: 'Ni 52',
    heat_no: '5601202',
    raw_material: {
      outer_diameter: '6.0',
      wall_thickness: '0.40',
      length: '2200',
      quantity_kg: '28'
    },
    finished_product: {
      outer_diameter: '1.5',
      inner_diameter: '0.90',
      wall_thickness: '0.30',
      length: '1900',
      quantity_kg: '25'
    },
    rows: [
      { outer_diameter: '6.0', wall_thickness: '0.40', length: '2200', cold_rolling: '1', cold_drawing: '', oiling: '', annealing: '', straightening: '', cutting: '', inspection: '' },
      { outer_diameter: '5.0', wall_thickness: '0.32', length: '3300', cold_rolling: '2', cold_drawing: '', oiling: '', annealing: '', straightening: '', cutting: '', inspection: '' },
      { outer_diameter: '4.0', wall_thickness: '0.30', length: '1450', cold_rolling: '', cold_drawing: '5', oiling: '4', annealing: '12', straightening: '', cutting: '3', inspection: '' },
      { outer_diameter: '3.0', wall_thickness: '0.30', length: '1800', cold_rolling: '', cold_drawing: '6', oiling: '', annealing: '', straightening: '', cutting: '', inspection: '' },
      { outer_diameter: '2.5', wall_thickness: '0.30', length: '2000', cold_rolling: '', cold_drawing: '7', oiling: '', annealing: '', straightening: '', cutting: '', inspection: '' },
      { outer_diameter: '1.9', wall_thickness: '0.30', length: '3100', cold_rolling: '', cold_drawing: '8', oiling: '11', annealing: '', straightening: '9', cutting: '10', inspection: '' },
      { outer_diameter: '1.5', wall_thickness: '0.30', length: '1900', cold_rolling: '', cold_drawing: '', oiling: '11', annealing: '12', straightening: '9', cutting: '10', inspection: '13' }
    ]
  },
  '0001304': {
    order_no: 'FM-260527-03',
    customer_name: '淄博海泰',
    steel_type: 'Ni 52',
    heat_no: '5601203',
    raw_material: {
      outer_diameter: '6.0',
      wall_thickness: '0.40',
      length: '2200',
      quantity_kg: '38'
    },
    finished_product: {
      outer_diameter: '2.0',
      inner_diameter: '1.25',
      wall_thickness: '0.375',
      length: '1900',
      quantity_kg: '35'
    },
    rows: [
      { outer_diameter: '6.0', wall_thickness: '0.40', length: '2200', cold_rolling: '', cold_drawing: '1', oiling: '', annealing: '', straightening: '', cutting: '', inspection: '' },
      { outer_diameter: '4.6', wall_thickness: '0.38', length: '1400', cold_rolling: '5', cold_drawing: '', oiling: '3', annealing: '', straightening: '4', cutting: '2', inspection: '' },
      { outer_diameter: '4.0', wall_thickness: '0.35', length: '1900', cold_rolling: '', cold_drawing: '7', oiling: '6', annealing: '', straightening: '', cutting: '', inspection: '' },
      { outer_diameter: '3.0', wall_thickness: '0.35', length: '1900', cold_rolling: '', cold_drawing: '8', oiling: '', annealing: '', straightening: '', cutting: '', inspection: '' },
      { outer_diameter: '2.5', wall_thickness: '0.35', length: '1900', cold_rolling: '', cold_drawing: '9', oiling: '', annealing: '', straightening: '', cutting: '', inspection: '' },
      { outer_diameter: '2.0', wall_thickness: '0.375', length: '1900', cold_rolling: '', cold_drawing: '', oiling: '12', annealing: '13', straightening: '10', cutting: '11', inspection: '14' }
    ]
  },
  '0001301': {
    order_no: 'Y20260527-006',
    customer_name: '广东致泰',
    steel_type: 'SUS 304',
    heat_no: '5602650',
    raw_material: {
      outer_diameter: '19.0',
      wall_thickness: '0.75',
      length: '1600',
      quantity_kg: '1100'
    },
    finished_product: {
      outer_diameter: '18.0',
      inner_diameter: '17.0',
      wall_thickness: '0.50',
      length: '1450',
      quantity_kg: '1450'
    },
    rows: [
      { outer_diameter: '19.0', wall_thickness: '0.75', length: '1600', cold_rolling: '1', cold_drawing: '', oiling: '', annealing: '', straightening: '', cutting: '', inspection: '' },
      { outer_diameter: '18.0', wall_thickness: '0.50', length: '2100', cold_rolling: '', cold_drawing: '', oiling: '2', annealing: '', straightening: '3', cutting: '1600', inspection: '4' }
    ]
  }
};

const SmartPlanEntryPage = () => {
  const parseDim = (val) => {
    if (!val) return { base: null, upper: null, lower: null, raw: val };
    const str = String(val).trim();
    let base = parseFloat(str);
    if (isNaN(base)) return { base: null, upper: null, lower: null, raw: str };
    
    if (str.includes('±')) {
      const parts = str.split('±');
      const tol = parseFloat(parts[1]);
      if (!isNaN(tol)) return { base, upper: tol, lower: -tol, raw: str };
    }
    
    const rest = str.replace(base.toString(), '').trim();
    if (rest.startsWith('+') || rest.startsWith('-') || rest.startsWith('/')) {
      let upper = null;
      let lower = null;
      const upperMatch = rest.match(/\+([0-9.]+)/);
      const lowerMatch = rest.match(/-([0-9.]+)/);
      if (upperMatch) upper = parseFloat(upperMatch[1]);
      if (lowerMatch) lower = -parseFloat(lowerMatch[1]);
      if (upper !== null && lower === null) lower = 0;
      if (lower !== null && upper === null) upper = 0;
      return { base, upper, lower, raw: str };
    }
    return { base, upper: null, lower: null, raw: str };
  };

  // 表单状态
  const [orderNo, setOrderNo] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [steelType, setSteelType] = useState('');
  const [heatNo, setHeatNo] = useState('');
  const [rawMaterial, setRawMaterial] = useState({ outer_diameter: '', wall_thickness: '', length: '', quantity_kg: '', isHighlight: false });
  const [finishedProduct, setFinishedProduct] = useState({ outer_diameter: '', inner_diameter: '', wall_thickness: '', length: '', quantity_kg: '', isHighlight: false });
  
  // 道次表格每一行结构
  const [rows, setRows] = useState([
    { rowId: 'row_init_0', outer_diameter: '', wall_thickness: '', length: '', process_type: 'DRAWING', need_oiling: true, need_annealing: true, need_straightening: false, need_cutting: false, need_inspection: false }
  ]);

  // AI 相关
  const [selectedSimKey, setSelectedSimKey] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);

  // 批量核对建档弹窗状态
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [verifyList, setVerifyList] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 客户列表
  const [customers, setCustomers] = useState([]);

  useEffect(() => {
    api.get('/customers').then(res => res.success && setCustomers(res.data));
  }, []);

  // 自动计算壁厚和单支重量
  const calcWallThickness = (od, idVal) => {
    if (od && idVal && !isNaN(od) && !isNaN(idVal)) {
      try {
        return new Decimal(od).minus(idVal).div(2).toFixed(3);
      } catch (e) { return ''; }
    }
    return '';
  };

  // 模拟 AI 图片解析
  const handleSimulateAI = (key) => {
    if (!key) return;
    setIsParsing(true);
    setSelectedSimKey(key);
    
    setTimeout(() => {
      const data = SIMULATED_TICKETS[key];
      setOrderNo(data.order_no);
      setCustomerName(data.customer_name);
      setSteelType(data.steel_type);
      setHeatNo(data.heat_no);
      setRawMaterial({ ...data.raw_material, isHighlight: true });
      setFinishedProduct({ ...data.finished_product, isHighlight: true });
      
      // 转换原rows中的工序序号为新版的加工类型与勾选状态
      const convertedRows = data.rows.map((r, rIdx) => {
        let process_type = 'NONE';
        if (r.cold_rolling !== undefined && r.cold_rolling !== '' && r.cold_rolling !== null) {
          process_type = 'ROLLING';
        } else if (r.cold_drawing !== undefined && r.cold_drawing !== '' && r.cold_drawing !== null) {
          process_type = 'DRAWING';
        }
        return {
          rowId: 'row_sim_' + rIdx + '_' + Date.now(),
          outer_diameter: r.outer_diameter || '',
          wall_thickness: r.wall_thickness || '',
          length: r.length || '',
          process_type,
          need_oiling: r.oiling !== undefined && r.oiling !== '' && r.oiling !== null,
          need_annealing: r.annealing !== undefined && r.annealing !== '' && r.annealing !== null,
          need_straightening: r.straightening !== undefined && r.straightening !== '' && r.straightening !== null,
          need_cutting: r.cutting !== undefined && r.cutting !== '' && r.cutting !== null,
          need_inspection: r.inspection !== undefined && r.inspection !== '' && r.inspection !== null,
          isHighlight: true
        };
      });
      setRows(convertedRows);
      setIsParsing(false);
      setImagePreview(`/api/placeholder/400/300`);
    }, 1200);
  };

  // 前端工序拆解预览逻辑
  const chainPreview = (() => {
    const actions = [];
    const rawOD = parseFloat(rawMaterial.outer_diameter) || 0;
    const rawWT = parseFloat(rawMaterial.wall_thickness) || 0;
    const isSteelStrip = rawOD > 0 && rawWT > 0 && rawOD < rawWT;

    // 如果原材料是钢带，自动在首位追加“焊接”工序
    if (isSteelStrip) {
      const targetOD = rows[0]?.outer_diameter || finishedProduct.outer_diameter || '';
      const targetWT = rows[0]?.wall_thickness || finishedProduct.wall_thickness || '';
      const targetLen = rows[0]?.length || finishedProduct.length || '';
      actions.push({
        process_code: 'WELDING',
        process_name: '焊接',
        row_index: -1,
        row_spec: {
          outer_diameter: targetOD,
          wall_thickness: targetWT,
          length: targetLen,
          name: `Φ${targetOD}*δ${targetWT}` + (targetLen ? `*${targetLen}` : '')
        }
      });
    }

    rows.forEach((row, rowIndex) => {
      const spec = {
        outer_diameter: row.outer_diameter || '',
        wall_thickness: row.wall_thickness || '',
        length: row.length || '',
        name: `Φ${row.outer_diameter || ''}*δ${row.wall_thickness || ''}` + (row.length ? `*${row.length}` : '')
      };

      // 1. 主工艺（形变工序）
      if (row.process_type === 'ROLLING') {
        actions.push({
          process_code: 'ROLLING',
          process_name: '冷轧',
          row_index: rowIndex,
          row_spec: spec
        });
      } else if (row.process_type === 'DRAWING') {
        actions.push({
          process_code: 'DRAWING',
          process_name: '冷拔',
          row_index: rowIndex,
          row_spec: spec
        });
      }

      // 2. 辅助工序
      if (row.need_oiling) {
        actions.push({
          process_code: 'CLEANING',
          process_name: '除油',
          row_index: rowIndex,
          row_spec: spec
        });
      }
      if (row.need_annealing) {
        actions.push({
          process_code: 'HEAT_TREATMENT',
          process_name: '退火',
          row_index: rowIndex,
          row_spec: spec
        });
      }
      if (row.need_straightening) {
        actions.push({
          process_code: 'STRAIGHTENING',
          process_name: '校直',
          row_index: rowIndex,
          row_spec: spec
        });
      }
      if (row.need_cutting) {
        actions.push({
          process_code: 'CUTTING',
          process_name: '切割',
          row_index: rowIndex,
          row_spec: spec
        });
      }
      if (row.need_inspection) {
        actions.push({
          process_code: 'INSPECTION',
          process_name: '检验',
          row_index: rowIndex,
          row_spec: spec
        });
      }
    });

    let currentSpec = {
      ...parseDim(rawMaterial.outer_diameter),
      outer_diameter: parseDim(rawMaterial.outer_diameter).base || 0,
      wall_thickness: parseDim(rawMaterial.wall_thickness).base || 0,
      length: parseDim(rawMaterial.length).base || null,
      raw_od: parseDim(rawMaterial.outer_diameter),
      raw_wt: parseDim(rawMaterial.wall_thickness),
      raw_len: parseDim(rawMaterial.length),
      name: isSteelStrip 
        ? `钢带${rawMaterial.outer_diameter}*${rawMaterial.wall_thickness}` + (rawMaterial.length ? `*${rawMaterial.length}` : '')
        : `Φ${rawMaterial.outer_diameter || ''}*δ${rawMaterial.wall_thickness || ''}` + (rawMaterial.length ? `*${rawMaterial.length}` : '')
    };

    return actions.map((act, idx) => {
      const inputSpec = { ...currentSpec };
      let isTransform = act.process_code === 'ROLLING' || act.process_code === 'DRAWING' || act.process_code === 'WELDING';
      if (isTransform && act.row_spec.outer_diameter) {
        currentSpec = {
          outer_diameter: parseDim(act.row_spec.outer_diameter).base,
          wall_thickness: parseDim(act.row_spec.wall_thickness).base,
          length: parseDim(act.row_spec.length).base || currentSpec.length,
          raw_od: parseDim(act.row_spec.outer_diameter),
          raw_wt: parseDim(act.row_spec.wall_thickness),
          raw_len: act.row_spec.length ? parseDim(act.row_spec.length) : currentSpec.raw_len,
          name: act.row_spec.name
        };
      }
      if (act.process_code === 'CUTTING' && act.row_spec.length) {
        currentSpec.length = parseDim(act.row_spec.length).base;
        currentSpec.raw_len = parseDim(act.row_spec.length);
        currentSpec.name = `Φ${currentSpec.outer_diameter}*δ${currentSpec.wall_thickness}*${currentSpec.length}`;
      }

      return {
        sequence: idx + 1,
        original_sequence: idx + 1,
        process_code: act.process_code,
        process_name: act.process_name,
        input_spec: inputSpec,
        output_spec: { ...currentSpec }
      };
    });
  })();


  const handleCheckAndSubmit = async (e) => {
    e.preventDefault();
    if (!finishedProduct.outer_diameter || !rawMaterial.outer_diameter) {
      alert('【验证未通过：无法提交审核】\n\n请先填写原材料和成品的尺寸规格（包含外径、壁厚/内径）！\n\n原因：系统需要使用原材料和成品的精确管径来进行“相似度排重”和“半成品多级计算”。未填写规格将导致查重和建档无法继续。');
      return;
    }

    setIsSubmitting(true);
    try {
      const listToVerify = [];

      // 1. 原材料匹配
      const rawRes = await api.post('/products/match-similar', {
        outer_diameter: rawMaterial.outer_diameter,
        wall_thickness: rawMaterial.wall_thickness,
        length: rawMaterial.length,
        category: '原材料'
      });
      listToVerify.push({
        role: 'raw_material',
        title: '原材料',
        temp_spec: `Φ${rawMaterial.outer_diameter}*δ${rawMaterial.wall_thickness}*${rawMaterial.length || ''}`,
        raw_data: rawMaterial,
        similars: rawRes.data || [],
        selected_action: 'create',
        suggested_code: '系统自动生成'
      });

      // 2. 中间步骤半成品匹配
      const addedSpecs = new Set();
      for (const step of chainPreview) {
        const isTransform = step.process_code === 'ROLLING' || step.process_code === 'DRAWING' || step.process_code === 'CUTTING' || step.process_code === 'WELDING';
        if (isTransform) {
          const specStr = `${step.output_spec.outer_diameter}_${step.output_spec.wall_thickness}_${step.output_spec.length || 0}`;
          if (!addedSpecs.has(specStr)) {
            addedSpecs.add(specStr);
            const semRes = await api.post('/products/match-similar', {
              outer_diameter: step.output_spec.outer_diameter,
              wall_thickness: step.output_spec.wall_thickness,
              length: step.output_spec.length,
              category: '半成品'
            });
            listToVerify.push({
              role: 'semi_product',
              title: `半成品 (${step.output_spec.name})`,
              temp_spec: step.output_spec.name,
              raw_data: step.output_spec,
              similars: semRes.data || [],
              selected_action: 'create',
              suggested_code: '系统自动生成'
            });
          }
        }
      }

      // 3. 成品匹配
      const finishedRes = await api.post('/products/match-similar', {
        outer_diameter: finishedProduct.outer_diameter,
        inner_diameter: finishedProduct.inner_diameter,
        wall_thickness: finishedProduct.wall_thickness,
        length: finishedProduct.length,
        category: '成品'
      });
      listToVerify.push({
        role: 'finished_product',
        title: '成品',
        temp_spec: `Φ${finishedProduct.outer_diameter}*Φ${finishedProduct.inner_diameter}*${finishedProduct.length || ''}`,
        raw_data: finishedProduct,
        similars: finishedRes.data || [],
        selected_action: 'create',
        suggested_code: '系统自动生成'
      });

      setVerifyList(listToVerify);
      setShowVerifyModal(true);
    } catch (err) {
      console.error(err);
      alert(`【无法继续：相似规格筛查失败】\n\n系统在向服务器查询相似规格以防重复建档时发生网络或数据库错误。\n\n具体原因：${err.message || '网络连接超时或服务器无响应'}。\n\n由于无法获取查重状态，系统为了数据安全，已阻止本次提交，请检查网络并重试。`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFinalSave = async () => {
    setIsSubmitting(true);
    try {
      const rawMap = verifyList.find(v => v.role === 'raw_material');
      const finishedMap = verifyList.find(v => v.role === 'finished_product');

      const body = {
        order_no: orderNo,
        customer_name: customerName,
        steel_type: steelType,
        heat_no: heatNo,
        raw_material: {
          id: rawMap.selected_action === 'create' ? null : parseInt(rawMap.selected_action),
          outer_diameter: rawMaterial.outer_diameter,
          wall_thickness: rawMaterial.wall_thickness,
          length: rawMaterial.length,
          quantity_kg: rawMaterial.quantity_kg,
          raw_od: parseDim(rawMaterial.outer_diameter),
          raw_wt: parseDim(rawMaterial.wall_thickness),
          raw_len: parseDim(rawMaterial.length)
        },
        finished_product: {
          id: finishedMap.selected_action === 'create' ? null : parseInt(finishedMap.selected_action),
          outer_diameter: finishedProduct.outer_diameter,
          inner_diameter: finishedProduct.inner_diameter,
          wall_thickness: finishedProduct.wall_thickness,
          length: finishedProduct.length,
          quantity_kg: finishedProduct.quantity_kg,
          raw_od: parseDim(finishedProduct.outer_diameter),
          raw_id: parseDim(finishedProduct.inner_diameter),
          raw_wt: parseDim(finishedProduct.wall_thickness),
          raw_len: parseDim(finishedProduct.length)
        },
        processes: chainPreview.map((step, idx) => {
          let matchingMatId = null;
          let matchingMatSpec = null;

          if (idx === 0) {
            matchingMatId = rawMap.selected_action === 'create' ? null : parseInt(rawMap.selected_action);
          } else {
            const searchSpec = `${step.input_spec.outer_diameter}_${step.input_spec.wall_thickness}_${step.input_spec.length || 0}`;
            const targetVerify = verifyList.find(v => v.role === 'semi_product' && `${v.raw_data.outer_diameter}_${v.raw_data.wall_thickness}_${v.raw_data.length || 0}` === searchSpec);
            if (targetVerify) {
              matchingMatId = targetVerify.selected_action === 'create' ? null : parseInt(targetVerify.selected_action);
              if (targetVerify.selected_action === 'create') {
                matchingMatSpec = {
                  outer_diameter: targetVerify.raw_data.outer_diameter,
                  wall_thickness: targetVerify.raw_data.wall_thickness,
                  length: targetVerify.raw_data.length,
                  raw_od: targetVerify.raw_data.raw_od,
                  raw_wt: targetVerify.raw_data.raw_wt,
                  raw_len: targetVerify.raw_data.raw_len
                };
              }
            }
          }

          return {
            sequence: step.sequence,
            process_code: step.process_code,
            material_id: matchingMatId,
            material_spec: matchingMatSpec,
            consumption_qty: 1.0,
            is_outsourced: 0,
            remark: `对应道次第 ${step.original_sequence} 步操作`
          };
        })
      };

      const res = await api.post('/production/intelligent-entry', body);
      if (res.success) {
        alert(`生产计划录入成功！生成生产单号：${res.data.production_order_no}`);
        setShowVerifyModal(false);
        setOrderNo('');
        setCustomerName('');
        setSteelType('');
        setHeatNo('');
        setRawMaterial({ outer_diameter: '', wall_thickness: '', length: '', quantity_kg: '', isHighlight: false });
        setFinishedProduct({ outer_diameter: '', inner_diameter: '', wall_thickness: '', length: '', quantity_kg: '', isHighlight: false });
        setRows([{ rowId: 'row_reset_' + Date.now(), outer_diameter: '', wall_thickness: '', length: '', process_type: 'DRAWING', need_oiling: true, need_annealing: true, need_straightening: false, need_cutting: false, need_inspection: false }]);
      } else {
        alert(`【无法继续：服务器拒绝保存】\n\n服务器在处理您的录入计划时报错，事务已被安全回滚。\n\n具体原因：${res.message || '参数验证未通过或数据写入受阻'}\n\n这通常是因为系统中缺少与计划单匹配的基础数据（例如部分道次所指工序代码未被激活，或者新建物料编码与现有冲突）。请根据具体提示调整计划单的道次设置，或联系系统管理员。`);
      }
    } catch (err) {
      console.error(err);
      alert(`【无法继续：计划提交异常】\n\n系统在尝试向服务器发送保存数据请求时发生未知错误。\n\n具体原因：${err.message || '本地脚本执行异常或连接中断'}\n\n由于数据没有安全存入服务器，请核准网络连接以及当前浏览器会话是否过期。`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRowChange = (index, field, val) => {
    const next = [...rows];
    next[index][field] = val;
    setRows(next);
  };

  const addRow = () => {
    // 将现有的所有行设为中间行配置（清除成品专用辅助工序）
    const updatedRows = rows.map(r => ({
      ...r,
      need_straightening: false,
      need_cutting: false,
      need_inspection: false
    }));
    
    // 新加的行作为最末行，默认勾选成品辅助工序（校直、检验）
    setRows([...updatedRows, {
      rowId: 'row_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      outer_diameter: '',
      wall_thickness: '',
      length: '',
      process_type: 'DRAWING',
      need_oiling: false,
      need_annealing: false,
      need_straightening: true,
      need_cutting: false,
      need_inspection: true
    }]);
  };

  const removeRow = (index) => {
    if (rows.length > 1) {
      const filtered = rows.filter((_, i) => i !== index);
      // 删除某行后，最后一行升格为新的成品行，勾选校直与检验
      const lastIdx = filtered.length - 1;
      filtered[lastIdx] = {
        ...filtered[lastIdx],
        need_straightening: true,
        need_inspection: true
      };
      setRows(filtered);
    }
  };

  return (
    <div className="space-y-6">
      {/* 头部装饰与模拟上传 */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 animate-fade-in">
        <div>
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <i className="fas fa-magic text-indigo-500"></i> 智能生产计划录入
          </h1>
          <p className="text-sm text-gray-500 mt-1">支持手工快捷填写、工艺步骤 Sequence 链条拆解与智能相似规格校验。</p>
        </div>
        <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-xl border border-gray-200">
          <span className="text-xs text-gray-600 font-medium pl-1">快速模拟 AI 导入单据:</span>
          <select
            value={selectedSimKey}
            onChange={(e) => handleSimulateAI(e.target.value)}
            className="text-xs bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
          >
            <option value="">-- 选择手写计划单图片 --</option>
            <option value="0001305">单据 0001305 (达克尔 SUS304)</option>
            <option value="0001302">单据 0001302 (淄博海泰 Ni52 - Φ3.3)</option>
            <option value="0001303">单据 0001303 (淄博海泰 Ni52 - Φ1.5)</option>
            <option value="0001304">单据 0001304 (淄博海泰 Ni52 - Φ2.0)</option>
            <option value="0001301">单据 0001301 (广东致泰 SUS304)</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* 左侧：原单据对照/图片拖拽区 */}
        <div className="xl:col-span-1 space-y-6">
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm flex flex-col h-full justify-between min-h-[400px]">
            <div>
              <h2 className="text-md font-bold text-gray-800 mb-4 flex items-center gap-1.5">
                <i className="fas fa-file-image text-indigo-400"></i> 手写单据对照
              </h2>
              {isParsing ? (
                <div className="flex flex-col items-center justify-center py-16 space-y-4">
                  <div className="relative w-16 h-16">
                    <div className="absolute inset-0 rounded-full border-4 border-indigo-100"></div>
                    <div className="absolute inset-0 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin"></div>
                  </div>
                  <p className="text-xs text-indigo-600 font-semibold animate-pulse">AI 深度提取结构化字段中...</p>
                </div>
              ) : selectedSimKey ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50 relative group">
                    <div className="absolute top-2 right-2 bg-indigo-600 text-white text-[10px] px-2 py-1 rounded font-bold shadow">
                      识别完成 (100% 对齐)
                    </div>
                    <div className="p-8 flex flex-col items-center justify-center text-center">
                      <i className="fas fa-clipboard-check text-5xl text-green-500 mb-3"></i>
                      <h3 className="font-bold text-gray-700 text-sm">单据 {selectedSimKey} 解析成功</h3>
                      <p className="text-xs text-gray-500 mt-1">系统已将数据高亮回填至右侧表单。</p>
                      <p className="text-xs text-amber-600 font-medium bg-amber-50 px-2 py-1 rounded border border-amber-200 mt-4">
                        ⚠️ 请核准右侧橙色框内容以完成建档。
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-12 flex flex-col items-center justify-center text-center hover:border-indigo-400 transition-colors cursor-pointer group">
                  <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center mb-4 group-hover:bg-indigo-100 transition-colors">
                    <i className="fas fa-cloud-upload-alt text-xl text-indigo-500"></i>
                  </div>
                  <p className="text-sm font-semibold text-gray-700">拖拽或点击上传手写单据图片</p>
                  <p className="text-xs text-gray-400 mt-1">支持 PNG, JPG, PDF。AI 将自动识别工序数字与规格。</p>
                </div>
              )}
            </div>

            <div className="border-t border-gray-100 pt-4 mt-6">
              <h4 className="text-xs font-semibold text-gray-600 mb-2">💡 录入小贴士:</h4>
              <ul className="text-xs text-gray-400 space-y-1.5 list-disc pl-4">
                <li>可在右上角下拉框中一键导入单据 0001303 体验其 13 道工序。</li>
                <li>外径及壁厚为匹配必填项。长度不同时系统会自动新建 SKU。</li>
                <li>表格下方实时生成工序流向图，可校对顺序。</li>
              </ul>
            </div>
          </div>
        </div>

        {/* 右侧：手工编辑表单 */}
        <div className="xl:col-span-2 space-y-6">
          <form onSubmit={handleCheckAndSubmit} className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-6">
            <h2 className="text-md font-bold text-gray-800 flex items-center gap-1.5 border-b border-gray-100 pb-3">
              <i className="fas fa-edit text-indigo-400"></i> 生产计划参数配置
            </h2>

            {/* 订单主信息 */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">订单编号 / 计划单号</label>
                <input
                  type="text"
                  required
                  value={orderNo}
                  onChange={(e) => setOrderNo(e.target.value)}
                  placeholder="如: FM-260527"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">客户名称</label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="请输入或选择客户"
                  list="customer-list"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <datalist id="customer-list">
                  {customers.map(c => <option key={c.id} value={c.name} />)}
                </datalist>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">钢种 / 材质</label>
                <input
                  type="text"
                  required
                  value={steelType}
                  onChange={(e) => setSteelType(e.target.value)}
                  placeholder="如: Ni 52"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">炉号</label>
                <input
                  type="text"
                  value={heatNo}
                  onChange={(e) => setHeatNo(e.target.value)}
                  placeholder="如: 5620202"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* 胚料与成品参数 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50/50 p-4 rounded-xl border border-gray-100">
              {/* 原材料配置 */}
              <div className={`space-y-3 p-3 rounded-lg border transition-all ${rawMaterial.isHighlight ? 'bg-amber-50/40 border-amber-200' : 'bg-white border-gray-200'}`}>
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-bold text-gray-700 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> 胚料规格（原材料）
                  </h3>
                  {rawMaterial.isHighlight && <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-semibold">AI提取，请核准</span>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-gray-500">外径 (Φ mm)</label>
                    <input
                      type="text"
                      required
                      value={rawMaterial.outer_diameter}
                      onChange={(e) => setRawMaterial({ ...rawMaterial, outer_diameter: e.target.value })}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500">壁厚 (δ mm)</label>
                    <input
                      type="text"
                      required
                      value={rawMaterial.wall_thickness}
                      onChange={(e) => setRawMaterial({ ...rawMaterial, wall_thickness: e.target.value })}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500">胚料长度 (mm)</label>
                    <input
                      type="text"
                      value={rawMaterial.length}
                      onChange={(e) => setRawMaterial({ ...rawMaterial, length: e.target.value })}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500">胚料重量 (kg)</label>
                    <input
                      type="number"
                      value={rawMaterial.quantity_kg}
                      onChange={(e) => setRawMaterial({ ...rawMaterial, quantity_kg: e.target.value })}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* 成品配置 */}
              <div className={`space-y-3 p-3 rounded-lg border transition-all ${finishedProduct.isHighlight ? 'bg-amber-50/40 border-amber-200' : 'bg-white border-gray-200'}`}>
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-bold text-gray-700 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> 成品规格（产出）
                  </h3>
                  {finishedProduct.isHighlight && <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-semibold">AI提取，请核准</span>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-gray-500">外径 (Φ mm)</label>
                    <input
                      type="text"
                      required
                      value={finishedProduct.outer_diameter}
                      onChange={(e) => {
                        const od = e.target.value;
                        const wt = calcWallThickness(od, finishedProduct.inner_diameter);
                        setFinishedProduct({ ...finishedProduct, outer_diameter: od, wall_thickness: wt });
                      }}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500">内径 (Φ mm)</label>
                    <input
                      type="text"
                      required
                      value={finishedProduct.inner_diameter}
                      onChange={(e) => {
                        const idVal = e.target.value;
                        const wt = calcWallThickness(finishedProduct.outer_diameter, idVal);
                        setFinishedProduct({ ...finishedProduct, inner_diameter: idVal, wall_thickness: wt });
                      }}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500">壁厚 (自动计算 δ)</label>
                    <input
                      type="text"
                      disabled
                      value={finishedProduct.wall_thickness}
                      className="w-full border border-gray-300 bg-gray-100 rounded px-2 py-1 text-xs text-gray-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500">成品长度 (mm)</label>
                    <input
                      type="text"
                      value={finishedProduct.length}
                      onChange={(e) => setFinishedProduct({ ...finishedProduct, length: e.target.value })}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] text-gray-500">计划产量重量 (kg)</label>
                    <input
                      type="number"
                      value={finishedProduct.quantity_kg}
                      onChange={(e) => setFinishedProduct({ ...finishedProduct, quantity_kg: e.target.value })}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 道次工艺表格 */}
            <div>
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-bold text-gray-800">🛠️ 道次工艺流程明细表</h3>
                <button
                  type="button"
                  onClick={addRow}
                  className="text-indigo-600 hover:text-indigo-800 text-xs font-semibold flex items-center gap-1 px-2.5 py-1.5 bg-indigo-50 rounded-lg border border-indigo-100 active:bg-indigo-100 transition-colors"
                >
                  <i className="fas fa-plus"></i> 新增规格行
                </button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="min-w-full text-xs text-left text-gray-700 bg-white">
                  <thead className="bg-gray-50 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2 w-12 text-center">道次</th>
                      <th className="px-3 py-2 w-28">外径 (Φ)</th>
                      <th className="px-3 py-2 w-28">壁厚 (δ)</th>
                      <th className="px-3 py-2 w-24">段长度</th>
                      <th className="px-3 py-2 text-center bg-blue-50/50 w-36">变形工序</th>
                      <th className="px-2 py-2 text-center w-16">除油</th>
                      <th className="px-2 py-2 text-center w-16">退火</th>
                      <th className="px-2 py-2 text-center w-16">校直</th>
                      <th className="px-2 py-2 text-center w-16">切割</th>
                      <th className="px-2 py-2 text-center w-16">检验</th>
                      <th className="px-3 py-2 w-12 text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {rows.map((row, idx) => (
                      <tr key={row.rowId || idx} className={row.isHighlight ? 'bg-amber-50/20' : ''}>
                        <td className="px-3 py-2 text-center font-semibold text-gray-400">{idx + 1}</td>
                        <td className="px-2 py-1">
                          <input
                            type="text"
                            value={row.outer_diameter}
                            onChange={(e) => handleRowChange(idx, 'outer_diameter', e.target.value)}
                            placeholder="外径"
                            className="w-full border border-gray-300 rounded px-1.5 py-1 text-xs"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            type="text"
                            value={row.wall_thickness}
                            onChange={(e) => handleRowChange(idx, 'wall_thickness', e.target.value)}
                            placeholder="壁厚"
                            className="w-full border border-gray-300 rounded px-1.5 py-1 text-xs"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            type="text"
                            value={row.length}
                            onChange={(e) => handleRowChange(idx, 'length', e.target.value)}
                            placeholder="段长"
                            className="w-full border border-gray-300 rounded px-1.5 py-1 text-xs"
                          />
                        </td>
                        {/* 加工方式选择 */}
                        <td className="px-2 py-1 text-center bg-blue-50/20">
                          <select
                            value={row.process_type}
                            onChange={(e) => handleRowChange(idx, 'process_type', e.target.value)}
                            className="w-full border border-gray-300 rounded px-1 py-1 text-xs"
                          >
                            <option value="ROLLING">冷轧 (ROLLING)</option>
                            <option value="DRAWING">冷拔 (DRAWING)</option>
                            <option value="NONE">无 (仅辅助工序)</option>
                          </select>
                        </td>
                        {/* 辅助工序勾选框 */}
                        <td className="px-1 py-1 text-center">
                          <input
                            type="checkbox"
                            checked={!!row.need_oiling}
                            onChange={(e) => handleRowChange(idx, 'need_oiling', e.target.checked)}
                            className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                          />
                        </td>
                        <td className="px-1 py-1 text-center">
                          <input
                            type="checkbox"
                            checked={!!row.need_annealing}
                            onChange={(e) => handleRowChange(idx, 'need_annealing', e.target.checked)}
                            className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                          />
                        </td>
                        <td className="px-1 py-1 text-center">
                          <input
                            type="checkbox"
                            checked={!!row.need_straightening}
                            onChange={(e) => handleRowChange(idx, 'need_straightening', e.target.checked)}
                            className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                          />
                        </td>
                        <td className="px-1 py-1 text-center">
                          <input
                            type="checkbox"
                            checked={!!row.need_cutting}
                            onChange={(e) => handleRowChange(idx, 'need_cutting', e.target.checked)}
                            className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                          />
                        </td>
                        <td className="px-1 py-1 text-center">
                          <input
                            type="checkbox"
                            checked={!!row.need_inspection}
                            onChange={(e) => handleRowChange(idx, 'need_inspection', e.target.checked)}
                            className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            disabled={rows.length === 1}
                            onClick={() => removeRow(idx)}
                            className="text-red-500 hover:text-red-700 disabled:text-gray-300"
                          >
                            <i className="fas fa-trash"></i>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 绝对工序流向预览区 */}
            {chainPreview.length > 0 && (
              <div className="bg-indigo-50/40 border border-indigo-100 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-bold text-indigo-800 flex items-center gap-1.5">
                  <i className="fas fa-project-diagram"></i> 解析后的工序绝对步骤链条 (当前共 {chainPreview.length} 步)
                </h4>
                
                {/* 滚动时间轴 */}
                <div className="flex items-center gap-3 overflow-x-auto py-2 pr-4 scrollbar-thin">
                  {chainPreview.map((step) => (
                    <React.Fragment key={step.sequence}>
                      <div className="flex-shrink-0 bg-white border border-indigo-200 rounded-xl p-3 shadow-sm min-w-[210px] space-y-1 relative">
                        {/* 序号气泡 */}
                        <div className="absolute -top-2 -left-2 bg-indigo-600 text-white w-5 h-5 rounded-full flex items-center justify-center font-bold text-[9px] shadow-sm">
                          {step.sequence}
                        </div>
                        {/* 工序名称 */}
                        <div className="flex justify-between items-center border-b border-gray-100 pb-1">
                          <span className="font-bold text-gray-800 text-xs">{step.process_name}</span>
                          <span className="text-[9px] bg-indigo-100 text-indigo-700 px-1 rounded font-semibold">标号:{step.original_sequence}</span>
                        </div>
                        {/* 规格变化 */}
                        <div className="text-[10px] space-y-0.5 text-gray-500">
                          <div className="truncate">输入: <span className="font-semibold text-gray-700">{step.input_spec.name}</span></div>
                          <div className="truncate text-indigo-600">输出: <span className="font-bold">{step.output_spec.name}</span></div>
                        </div>
                      </div>
                      
                      {step.sequence < chainPreview.length && (
                        <div className="flex-shrink-0 text-indigo-400">
                          <i className="fas fa-chevron-right"></i>
                        </div>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            )}

            {/* 按钮操作 */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <button
                type="submit"
                disabled={isSubmitting}
                className="bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-semibold px-6 py-2.5 rounded-xl shadow-md hover:shadow-lg disabled:bg-gray-300 transition-all flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <i className="fas fa-spinner animate-spin"></i> 正在筛查规格...
                  </>
                ) : (
                  <>
                    <i className="fas fa-check-circle"></i> 提交计划审核建档
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* 相似规格核准与建档弹窗 */}
      {showVerifyModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-gray-100 w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl animate-fade-in">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white p-5 flex justify-between items-center">
              <div>
                <h3 className="text-md font-bold flex items-center gap-2">
                  <i className="fas fa-clipboard-check"></i> 生产计划物料规格核准与相似度查重
                </h3>
                <p className="text-xs text-indigo-200 mt-1">系统对计划单中的原材料、半成品和成品进行了查重，请确认是否复用或新建。</p>
              </div>
              <button onClick={() => setShowVerifyModal(false)} className="text-white hover:text-gray-200 text-xl font-bold">
                &times;
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-xs text-amber-800">
                <i className="fas fa-exclamation-triangle text-lg text-amber-500 mt-0.5"></i>
                <div>
                  <p className="font-bold">⚠️ 项目经理决策准则提示：</p>
                  <p className="mt-1">1. 只要**长度不同**，系统推荐您**新建物料档案**以防止长度混淆。</p>
                  <p className="mt-0.5">2. 若管径及壁厚相同且长度一致，建议直接复用已有编码以避免重复建档。</p>
                </div>
              </div>

              <div className="space-y-4">
                {verifyList.map((item, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-gray-800 bg-white border border-gray-200 px-3 py-1 rounded-lg">
                        {item.title}
                      </span>
                      <span className="text-xs text-gray-500">
                        计划规格: <strong className="text-gray-800">{item.temp_spec}</strong>
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* 当前计划参数 */}
                      <div className="bg-white border border-gray-200 rounded-lg p-3 text-xs space-y-1.5">
                        <h4 className="font-bold text-gray-500 border-b border-gray-100 pb-1">本次计划要登记的规格：</h4>
                        <div>外径: <span className="font-semibold">{item.raw_data.outer_diameter} mm</span></div>
                        {item.raw_data.inner_diameter && <div>内径: <span className="font-semibold">{item.raw_data.inner_diameter} mm</span></div>}
                        {item.raw_data.wall_thickness && <div>壁厚: <span className="font-semibold">{item.raw_data.wall_thickness} mm</span></div>}
                        <div>长度: <span className="font-semibold">{item.raw_data.length || '不定尺'} mm</span></div>
                      </div>

                      {/* 处理动作选择 */}
                      <div className="bg-white border border-gray-200 rounded-lg p-3 text-xs flex flex-col justify-between">
                        <h4 className="font-bold text-gray-500 border-b border-gray-100 pb-1 mb-2">建档决策：</h4>
                        
                        <div className="space-y-2">
                          <label className="flex items-start gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name={`verify-action-${idx}`}
                              checked={item.selected_action === 'create'}
                              onChange={() => {
                                const next = [...verifyList];
                                next[idx].selected_action = 'create';
                                setVerifyList(next);
                              }}
                              className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                            />
                            <div>
                              <span className="font-bold text-indigo-600">新建物料编码并存盘</span>
                              <span className="text-[10px] text-gray-400 block mt-0.5">（新长度或新参数，系统自动分配新编码）</span>
                            </div>
                          </label>

                          {item.similars.length > 0 && (
                            <div className="pt-1 border-t border-gray-100 mt-2 space-y-2">
                              <span className="text-[10px] font-bold text-gray-400 block">发现系统中存在相似规格：</span>
                              {item.similars.map(sim => (
                                <label key={sim.id} className="flex items-start gap-2 cursor-pointer pl-1">
                                  <input
                                    type="radio"
                                    name={`verify-action-${idx}`}
                                    checked={item.selected_action === String(sim.id)}
                                    onChange={() => {
                                      const next = [...verifyList];
                                      next[idx].selected_action = String(sim.id);
                                      setVerifyList(next);
                                    }}
                                    className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                                  />
                                  <div>
                                    <span className="font-semibold text-gray-700">复用已有：{sim.code} - {sim.name}</span>
                                    <span className="text-[10px] text-emerald-600 font-medium block">
                                      （匹配相似度: {sim.similarity_score}% {sim.len_match ? '，长度一致' : '，长度不同'}）
                                    </span>
                                  </div>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="bg-gray-50 p-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowVerifyModal(false)}
                className="bg-white border border-gray-300 text-gray-700 text-sm font-semibold px-5 py-2 rounded-xl active:bg-gray-100 transition-colors"
              >
                取消修改
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleFinalSave}
                className="bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-semibold px-6 py-2 rounded-xl shadow-md disabled:bg-gray-300 transition-all"
              >
                {isSubmitting ? (
                  <>
                    <i className="fas fa-spinner animate-spin mr-1"></i> 正在智能建档入库...
                  </>
                ) : (
                  <>
                    <i className="fas fa-save mr-1"></i> 确认准入并生成生产计划
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SmartPlanEntryPage;
