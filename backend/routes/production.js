const express = require('express');
const router = express.Router();
const Decimal = require('decimal.js');
const { generateOrderNo } = require('../utils/order-number');
const { requirePermission } = require('../middleware/permission');
const { validate, validateId } = require('../middleware/validate');
const { writeLog } = require('./logs');
const { BusinessError } = require('../utils/BusinessError');
const ProductionService = require('../services/ProductionService');
const { processReportSchema, productionStatusSchema, createProductionSchema, updateProductionSchema, reworkSchema } = require('../validators/production');


// ==================== 工序 ====================
router.get('/processes', requirePermission('production_view'), async (req, res) => {
  try {
    const processes = await req.db.all('SELECT * FROM processes ORDER BY sequence');
    res.json({ success: true, data: processes });
  } catch (error) {
    console.error(`[production.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ==================== 生产工单 ====================
router.get('/', requirePermission('production_view'), async (req, res) => {
  try {
    const { status, process, processCode, order_id, page = 1, pageSize = 20 } = req.query;
    if (processCode) {
      // 查询在该工序有可用工作的所有活跃工单
      // «有可用工作» = 该工序属于工单产品的工艺路线，且：
      //   首道工序 → 工单活跃即可
      //   非首道 → 前一道工序有累计产出
      const sql = `SELECT DISTINCT po.*, p.code as product_code, p.name as product_name, p.specification, p.unit,
              p.outer_diameter, p.wall_thickness, p.length,
              o.order_no as ref_order_no, o.customer_name
            FROM production_orders po
            JOIN products p ON po.product_id = p.id
            LEFT JOIN orders o ON po.order_id = o.id
            JOIN product_processes pp ON pp.product_id = po.product_id
            JOIN processes pr ON pr.id = pp.process_id
            WHERE po.status != 'completed' AND pr.code = ?
              AND (
                pp.sequence = (SELECT MIN(pp2.sequence) FROM product_processes pp2 WHERE pp2.product_id = po.product_id)
                OR (
                  SELECT COALESCE(SUM(ppr.output_quantity), 0)
                  FROM production_process_records ppr
                  JOIN product_processes prev_pp ON prev_pp.product_id = po.product_id AND prev_pp.process_id = ppr.process_id
                  WHERE ppr.production_order_id = po.id AND ppr.status = 'completed'
                    AND prev_pp.sequence = pp.sequence - 1
                ) > 0
              )
            ORDER BY po.created_at DESC`;
      const orders = await req.db.all(sql, [processCode]);
      return res.json({ success: true, data: orders });
    }
    let sql = `SELECT po.*, p.code as product_code, p.name as product_name, p.specification, p.unit, p.outer_diameter, p.wall_thickness, p.length, o.order_no as ref_order_no, o.customer_name FROM production_orders po JOIN products p ON po.product_id = p.id LEFT JOIN orders o ON po.order_id = o.id WHERE 1=1`;
    const params = [];
    if (status) {
      const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        sql += ' AND po.status = ?'; params.push(statuses[0]);
      } else {
        sql += ` AND po.status IN (${statuses.map(() => '?').join(',')})`; params.push(...statuses);
      }
    }
    if (process) { sql += ' AND po.current_process = ?'; params.push(process); }
    if (order_id) { sql += ' AND po.order_id = ?'; params.push(order_id); }
    sql += ' ORDER BY po.created_at DESC';
    const result = await req.db.paginate(sql, params, parseInt(page), parseInt(pageSize));

    // 批量附加精简进度信息（process_step + next_process_name）
    if (result.data.length > 0) {
      const poIds = result.data.map(po => po.id);
      const prodIds = [...new Set(result.data.map(po => po.product_id))];
      const poPh = poIds.map(() => '?').join(',');
      const prodPh = prodIds.map(() => '?').join(',');

      // 批量查询各产品的工序配置
      const allPP = await req.db.all(
        `SELECT pp.product_id, pr.code as process_code, pr.name as process_name, pp.sequence
         FROM product_processes pp JOIN processes pr ON pp.process_id = pr.id
         WHERE pp.product_id IN (${prodPh}) ORDER BY pp.sequence`, prodIds
      );
      // 批量查询各工单各工序的累计产出
      const allOutputs = await req.db.all(
        `SELECT ppr.production_order_id, pr.code as process_code, COALESCE(SUM(ppr.output_quantity), 0) as output
         FROM production_process_records ppr JOIN processes pr ON ppr.process_id = pr.id
         WHERE ppr.production_order_id IN (${poPh}) AND ppr.status = 'completed'
         GROUP BY ppr.production_order_id, pr.code`, poIds
      );
      const outputMap = {};
      allOutputs.forEach(r => {
        if (!outputMap[r.production_order_id]) outputMap[r.production_order_id] = {};
        outputMap[r.production_order_id][r.process_code] = parseFloat(r.output) || 0;
      });

      for (const po of result.data) {
        const ppList = allPP.filter(pp => pp.product_id === po.product_id);
        const poOutputs = outputMap[po.id] || {};
        let completedCount = 0;
        let currentName = null, nextName = null;
        let weightedSum = new Decimal(0);
        for (let i = 0; i < ppList.length; i++) {
          const out = poOutputs[ppList[i].process_code] || 0;
          const target = po.quantity || 0;
          if (out >= target) {
            completedCount++;
            weightedSum = weightedSum.plus(1);
          } else if (target > 0) {
            // 部分完成也计入加权进度
            weightedSum = weightedSum.plus(new Decimal(out).div(target));
          }
          if (out < target && !currentName) {
            currentName = ppList[i].process_name;
            nextName = i < ppList.length - 1 ? ppList[i + 1].process_name : null;
          }
        }
        po.process_step = `${completedCount}/${ppList.length}`;
        // 加权百分比：每道工序按 min(产出/目标, 1) 求均值
        po.process_percentage = ppList.length > 0
          ? weightedSum.div(ppList.length).times(100).toDecimalPlaces(1).toNumber()
          : 0;
        po.current_process_name = currentName || (ppList.length > 0 ? '已完成' : '无工序');
        po.next_process_name = nextName;
      }
    }

    res.json({ success: true, data: result.data, pagination: result.pagination });
  } catch (error) {
    console.error(`[production.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/:id', validateId, requirePermission('production_view'), async (req, res) => {
  try {
    const id = req.params.id;
    const order = await req.db.get(`SELECT po.*, p.code as product_code, p.name as product_name, p.specification, p.unit, p.outer_diameter, p.wall_thickness, p.length, o.order_no as ref_order_no, o.customer_name FROM production_orders po JOIN products p ON po.product_id = p.id LEFT JOIN orders o ON po.order_id = o.id WHERE po.id = ?`, [id]);
    if (!order) return res.status(404).json({ success: false, message: '工单不存在' });

    // 并行查询：这6条SQL之间互不依赖
    const [processRecords, outsourcingOrders, inboundOrders, processSummary, productProcesses, pickedMaterials] = await Promise.all([
      req.db.all(`SELECT ppr.*, pr.name as process_name, pr.code as process_code FROM production_process_records ppr JOIN processes pr ON ppr.process_id = pr.id WHERE ppr.production_order_id = ? AND ppr.status != 'pending' ORDER BY pr.sequence, ppr.created_at`, [id]),
      req.db.all(`SELECT oo.id, oo.order_no, oo.status, oo.created_at, s.name as supplier_name, pr.name as process_name FROM outsourcing_orders oo LEFT JOIN suppliers s ON oo.supplier_id = s.id LEFT JOIN processes pr ON oo.process_id = pr.id WHERE oo.production_order_id = ? ORDER BY oo.created_at DESC`, [id]),
      req.db.all(`SELECT io.*, w.name as warehouse_name FROM inbound_orders io LEFT JOIN warehouses w ON io.warehouse_id = w.id WHERE io.production_order_id = ? ORDER BY io.created_at DESC`, [id]),
      req.db.all(`SELECT pr.code as process_code, pr.name as process_name, COALESCE(SUM(ppr.output_quantity), 0) as cumulative_output, COALESCE(SUM(ppr.defect_quantity), 0) as cumulative_defect FROM production_process_records ppr JOIN processes pr ON ppr.process_id = pr.id WHERE ppr.production_order_id = ? AND ppr.status = 'completed' GROUP BY ppr.process_id, pr.code, pr.name ORDER BY MIN(pr.sequence)`, [id]),
      req.db.all(`SELECT pp.*, pr.name as process_name, pr.code as process_code FROM product_processes pp JOIN processes pr ON pp.process_id = pr.id WHERE pp.product_id = ? ORDER BY pp.sequence`, [order.product_id]),
      req.db.all(`SELECT pi.material_id, p.name as material_name, p.code as material_code, p.unit, p.outer_diameter, p.wall_thickness, p.length as material_length, SUM(pi.quantity) as picked_quantity FROM pick_items pi JOIN pick_orders pk ON pi.pick_order_id = pk.id JOIN products p ON pi.material_id = p.id WHERE pk.production_order_id = ? AND pk.type = 'pick' AND pk.status = 'completed' GROUP BY pi.material_id, p.name, p.code, p.unit, p.outer_diameter, p.wall_thickness, p.length`, [id])
    ]);

    // ========== 工序进度全景图（纯内存计算）==========
    const summaryMap = Object.fromEntries(
      processSummary.map(s => [s.process_code, { output: parseFloat(s.cumulative_output) || 0, defect: parseFloat(s.cumulative_defect) || 0 }])
    );
    const processFlow = productProcesses.map((pp, idx) => {
      const data = summaryMap[pp.process_code] || { output: 0, defect: 0 };
      const prevCode = idx > 0 ? productProcesses[idx - 1].process_code : null;
      const target = prevCode ? (summaryMap[prevCode]?.output || 0) : (order.quantity || 0);
      let status = 'pending';
      if (data.output >= (order.quantity || 0)) status = 'completed';
      else if (data.output > 0) status = 'in_progress';
      return {
        process_id: pp.process_id, process_name: pp.process_name, process_code: pp.process_code,
        sequence: pp.sequence, is_outsourced: pp.is_outsourced,
        output: data.output, defect: data.defect, target,
        percentage: target > 0 ? new Decimal(data.output).div(target).times(100).toDecimalPlaces(1).toNumber() : 0,
        status
      };
    });
    const currentIdx = processFlow.findIndex(p => p.status !== 'completed');
    const currentProcessName = currentIdx >= 0 ? processFlow[currentIdx].process_name : (processFlow.length > 0 ? '已完成' : '无工序');
    const nextProcessName = currentIdx >= 0 && currentIdx < processFlow.length - 1 ? processFlow[currentIdx + 1].process_name : null;
    const completedCount = processFlow.filter(p => p.status === 'completed').length;
    const processStep = `${completedCount}/${processFlow.length}`;

    res.json({ success: true, data: {
      ...order, processRecords, outsourcingOrders, inboundOrders, processSummary,
      processFlow, currentProcessName, nextProcessName, processStep, pickedMaterials
    } });
  } catch (error) {
    console.error(`[production.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/', requirePermission('production_create'), validate(createProductionSchema), async (req, res) => {
  try {
    const { order_id, product_id, quantity, operator, remark, start_time, end_time } = req.body;
    
    // 【防呆】检验销售订单剩余可派发产出量（考虑良品率反馈逻辑）
    if (order_id) {
      const orderItem = await req.db.get('SELECT quantity FROM order_items WHERE order_id = ? AND product_id = ?', [order_id, product_id]);
      if (orderItem) {
        // 计算属于该订单&同产品的工单已占用的产能
        // 如果状态是已完成，则取真实出产报工数量(良品数 completed_quantity)；如果是进行中，则视全部入投 quantity 已经被占用。取消的则剔除。
        const relatedOrders = await req.db.all("SELECT status, quantity, completed_quantity FROM production_orders WHERE order_id = ? AND product_id = ? AND status != 'cancelled'", [order_id, product_id]);
        let consumed = 0;
        for (const po of relatedOrders) {
          if (po.status === 'completed') {
            consumed += (po.completed_quantity || 0);
          } else {
            consumed += (po.quantity || 0);
          }
        }
        const remaining = orderItem.quantity - consumed;
        if (quantity > remaining) {
          return res.status(400).json({ success: false, message: `您超发了！订单总需 ${orderItem.quantity} 件，除去在制与已完工良品后，当前最多只允许再投产 ${Math.max(0, remaining)} 件。` });
        }
      }
    }

    const orderNo = generateOrderNo('PO');
    let productionId;
    
    await req.db.transaction(async () => {
      const result = await req.db.run(`INSERT INTO production_orders (order_no, order_id, product_id, quantity, operator, remark, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderNo, order_id || null, product_id, quantity, operator || null, remark || null, start_time || null, end_time || null]);
      productionId = result.lastInsertRowid;
      const productProcesses = await req.db.all(`SELECT pp.*, p.code as process_code FROM product_processes pp JOIN processes p ON pp.process_id = p.id WHERE pp.product_id = ? ORDER BY pp.sequence`, [product_id]);
      if (productProcesses.length > 0) {
        for (const pp of productProcesses) { await req.db.run(`INSERT INTO production_process_records (production_order_id, process_id, status) VALUES (?, ?, 'pending')`, [productionId, pp.process_id]); }
        await req.db.run('UPDATE production_orders SET current_process = ? WHERE id = ?', [productProcesses[0].process_code, productionId]);
      }
    });
    writeLog(req.db, req.user?.id, '创建生产工单', 'production', productionId, `工单号: ${orderNo}`);
    res.json({ success: true, data: { id: productionId, order_no: orderNo } });
  } catch (error) {
    console.error(`[production.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 工序操作
router.post('/:id/process', validateId, requirePermission('production_edit'), validate(processReportSchema), async (req, res) => {
  try {
    let responseData;
    await req.db.transaction(async () => {
      responseData = await ProductionService.submitProcessReport(req.db, req.params.id, req.body);
    });
    // 【修复#2】res.json 移到事务外部，确保事务回滚时不会返回假成功
    res.json(responseData);
  } catch (error) {
    console.error(`[production.js]`, error.message);
    if (error instanceof BusinessError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/:id/sync-processes', validateId, requirePermission('production_edit'), async (req, res) => {
  try {
    const order = await req.db.get('SELECT * FROM production_orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ success: false, message: '生产工单不存在' });
    
    // 检查是否有已经开始处理的工序
    const processing = await req.db.get("SELECT count(*) as count FROM production_process_records WHERE production_order_id = ? AND status != 'pending'", [req.params.id]);
    if (processing.count > 0) {
      return res.status(400).json({ success: false, message: '已有工序开始报工，无法同步新流程' });
    }
    
    await req.db.transaction(async () => {
      await req.db.run('DELETE FROM production_process_records WHERE production_order_id = ?', [req.params.id]);
      
      const productProcesses = await req.db.all(`SELECT pp.*, p.code as process_code FROM product_processes pp JOIN processes p ON pp.process_id = p.id WHERE pp.product_id = ? ORDER BY pp.sequence`, [order.product_id]);
      if (productProcesses.length > 0) {
        for (const pp of productProcesses) { 
          await req.db.run(`INSERT INTO production_process_records (production_order_id, process_id, status) VALUES (?, ?, 'pending')`, [req.params.id, pp.process_id]); 
        }
        await req.db.run('UPDATE production_orders SET current_process = ? WHERE id = ?', [productProcesses[0].process_code, req.params.id]);
      } else {
        await req.db.run('UPDATE production_orders SET current_process = NULL WHERE id = ?', [req.params.id]);
      }
    });
    
    res.json({ success: true, message: '已成功同步最新工序' });
  } catch (error) {
    console.error(`[production.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.put('/:id/status', validateId, requirePermission('production_edit'), validate(productionStatusSchema), async (req, res) => {
  try {
    const { status } = req.body;
    await req.db.transaction(async () => {
      const production = await req.db.get('SELECT * FROM production_orders WHERE id = ?', [req.params.id]);
      await req.db.run('UPDATE production_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, req.params.id]);
      // 【联动】手动标完成时也触发订单进度更新 + 成品入库
      if (status === 'completed' && production && production.order_id) {
        await ProductionService.updateOrderProgress(req.db, production.order_id);
      }
    });
    res.json({ success: true });
  } catch (error) {
    console.error(`[production.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.put('/:id', validateId, requirePermission('production_edit'), validate(updateProductionSchema), async (req, res) => {
  try {
    const { order_id, product_id, quantity, operator, remark, start_time, end_time } = req.body;
    const order = await req.db.get('SELECT * FROM production_orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ success: false, message: '生产工单不存在' });
    if (order.status !== 'pending') return res.status(400).json({ success: false, message: '只能编辑待处理状态的工单' });
    
    await req.db.transaction(async () => {
      await req.db.run(`
        UPDATE production_orders
        SET order_id = ?, product_id = ?, quantity = ?, operator = ?, remark = ?,
            start_time = ?, end_time = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
        [order_id || null, product_id, quantity, operator, remark, start_time || null, end_time || null, req.params.id]);
      if (product_id != order.product_id) {
        await req.db.run('DELETE FROM production_process_records WHERE production_order_id = ?', [req.params.id]);
        const productProcesses = await req.db.all(`SELECT pp.*, p.code as process_code FROM product_processes pp JOIN processes p ON pp.process_id = p.id WHERE pp.product_id = ? ORDER BY pp.sequence`, [product_id]);
        if (productProcesses.length > 0) {
          for (const pp of productProcesses) { await req.db.run(`INSERT INTO production_process_records (production_order_id, process_id, status) VALUES (?, ?, 'pending')`, [req.params.id, pp.process_id]); }
          await req.db.run('UPDATE production_orders SET current_process = ? WHERE id = ?', [productProcesses[0].process_code, req.params.id]);
        }
      }
    });
    res.json({ success: true });
  } catch (error) {
    console.error(`[production.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.delete('/:id', validateId, requirePermission('production_delete'), async (req, res) => {
  try {
    const { force } = req.query;
    const order = await req.db.get('SELECT * FROM production_orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ success: false, message: '生产工单不存在' });
    const isAdmin = req.user?.role_code === 'admin';
    if (order.status !== 'pending' && force !== 'true' && !isAdmin) return res.status(400).json({ success: false, message: '只能删除待处理状态的工单，如需删除请联系管理员' });
    await req.db.transaction(async () => {
      // 清理关联委外单（含检验记录和明细）
      const outsourcings = await req.db.all('SELECT id FROM outsourcing_orders WHERE production_order_id = ?', [req.params.id]);
      for (const oo of outsourcings) {
        await req.db.run('DELETE FROM outsourcing_inspections WHERE outsourcing_id = ?', [oo.id]);
        await req.db.run('DELETE FROM outsourcing_items WHERE outsourcing_order_id = ?', [oo.id]);
      }
      await req.db.run('DELETE FROM outsourcing_orders WHERE production_order_id = ?', [req.params.id]);
      // 清理关联领料单
      const picks = await req.db.all('SELECT id FROM pick_orders WHERE production_order_id = ?', [req.params.id]);
      for (const pk of picks) {
        await req.db.run('DELETE FROM pick_items WHERE pick_order_id = ?', [pk.id]);
        await req.db.run('DELETE FROM pick_orders WHERE id = ?', [pk.id]);
      }
      await req.db.run('DELETE FROM production_process_records WHERE production_order_id = ?', [req.params.id]);
      await req.db.run('DELETE FROM production_orders WHERE id = ?', [req.params.id]);
    });
    res.json({ success: true });
  } catch (error) {
    console.error(`[production.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ==================== 返工流程 ====================
router.post('/:id/rework', validateId, requirePermission('production_edit'), validate(reworkSchema), async (req, res) => {
  try {
    const { target_process_id, quantity, reason, operator } = req.body;

    const production = await req.db.get('SELECT * FROM production_orders WHERE id = ?', [req.params.id]);
    if (!production) return res.status(404).json({ success: false, message: '工单不存在' });

    // 允许从 quality_hold（质检暂停）或 completed（客户退回返工）发起
    if (!['quality_hold', 'completed'].includes(production.status)) {
      return res.status(400).json({ success: false, message: '只有质检暂停或已完成（客户退回）的工单才能发起返工' });
    }

    // 校验目标工序属于该产品的工序配置
    const productProcesses = await req.db.all(
      `SELECT pp.*, p.code as process_code, p.name as process_name
       FROM product_processes pp JOIN processes p ON pp.process_id = p.id
       WHERE pp.product_id = ? ORDER BY pp.sequence`, [production.product_id]);
    const targetIndex = productProcesses.findIndex(pp => pp.process_id == target_process_id);
    if (targetIndex === -1) return res.status(400).json({ success: false, message: '目标工序不属于该产品的工序配置' });

    const targetProcess = productProcesses[targetIndex];
    const reworkQty = quantity || production.quantity;

    await req.db.transaction(async () => {
      // 1. 回退工单：current_process 设为目标工序，状态恢复 processing
      await req.db.run(
        'UPDATE production_orders SET current_process = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [targetProcess.process_code, 'processing', req.params.id]);

      // 2. 为目标工序及其之后的工序插入新的 pending 记录（标记为返工重做）
      for (let i = targetIndex; i < productProcesses.length; i++) {
        await req.db.run(
          `INSERT INTO production_process_records (production_order_id, process_id, status, remark) VALUES (?, ?, 'pending', ?)`,
          [req.params.id, productProcesses[i].process_id, i === targetIndex ? `返工(${reason})` : '返工待重做']);
      }
    });

    writeLog(req.db, req.user?.id, '发起返工', 'production', req.params.id,
      `回退到工序「${targetProcess.process_name}」，数量 ${reworkQty}，原因：${reason}`);

    res.json({ success: true, message: `已回退到工序「${targetProcess.process_name}」，请安排车间重新报工` });
  } catch (error) {
    console.error('[production.js/rework]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
