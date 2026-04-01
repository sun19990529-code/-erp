const express = require('express');
const router = express.Router();
const { requirePermission } = require('../middleware/permission');
const { validateId } = require('../middleware/validate');
const { writeLog } = require('./logs');
const { generateOrderNo } = require('../utils/order-number');
const { sendNotification } = require('./notifications');

// ==================== 工位 CRUD ====================

// 获取所有工位（含工序信息）
router.get('/', requirePermission('production_view'), async (req, res) => {
  try {
    const stations = await req.db.all(`
      SELECT w.*, p.name as process_name, p.code as process_code
      FROM workstations w
      LEFT JOIN processes p ON w.process_id = p.id
      ORDER BY p.sequence, w.code
    `);
    res.json({ success: true, data: stations });
  } catch (error) {
    console.error('[workstation.js]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 创建工位
router.post('/', requirePermission('production_create'), async (req, res) => {
  try {
    const { code, name, process_id, remark } = req.body;
    if (!code || !name) return res.status(400).json({ success: false, message: '工位编码和名称不能为空' });
    const existing = await req.db.get('SELECT id FROM workstations WHERE code = ?', [code]);
    if (existing) return res.status(400).json({ success: false, message: `工位编码 ${code} 已存在` });
    const result = await req.db.run(
      'INSERT INTO workstations (code, name, process_id, remark) VALUES (?, ?, ?, ?)',
      [code.trim(), name.trim(), process_id || null, remark || null]
    );
    writeLog(req.db, req.user?.id, '创建工位', 'workstation', result.lastInsertRowid, `${code} - ${name}`);
    res.json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (error) {
    console.error('[workstation.js]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 修改工位
router.put('/:id', validateId, requirePermission('production_edit'), async (req, res) => {
  try {
    const { code, name, process_id, status, remark } = req.body;
    await req.db.run(
      'UPDATE workstations SET code = ?, name = ?, process_id = ?, status = ?, remark = ? WHERE id = ?',
      [code, name, process_id || null, status ?? 1, remark || null, req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('[workstation.js]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 删除工位
router.delete('/:id', validateId, requirePermission('production_delete'), async (req, res) => {
  try {
    await req.db.run('DELETE FROM workstations WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('[workstation.js]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ==================== 工位展示屏接口 ====================
// GET 路由：工位大屏纯展示用，无需登录（JWT 白名单放行）
// POST 路由：报工/巡检涉及数据变更，需要登录 Token

// 按工位编码查询当前任务列表
router.get('/screen/:code', async (req, res) => {
  try {
    const station = await req.db.get(`
      SELECT w.*, p.name as process_name, p.code as process_code, p.id as process_id_real
      FROM workstations w
      LEFT JOIN processes p ON w.process_id = p.id
      WHERE w.code = ?
    `, [req.params.code]);
    if (!station) return res.status(404).json({ success: false, message: '工位不存在' });

    // 查询当前工序上的所有在制工单
    const processCode = station.process_code;
    const tasks = processCode ? await req.db.all(`
      SELECT po.id, po.order_no, po.quantity, po.completed_quantity, po.status, po.current_process, po.created_at,
             p.code as product_code, p.name as product_name, p.specification, p.unit,
             p.outer_diameter, p.inner_diameter, p.wall_thickness, p.length,
             p.tolerance_od, p.tolerance_id, p.tolerance_wt, p.tolerance_len,
             p.tolerance_od_lower, p.tolerance_id_lower, p.tolerance_wt_lower, p.tolerance_len_lower,
             o.order_no as sales_order_no, o.customer_name
      FROM production_orders po
      JOIN products p ON po.product_id = p.id
      LEFT JOIN orders o ON po.order_id = o.id
      WHERE po.current_process = ? AND po.status IN ('pending', 'processing')
      ORDER BY po.created_at
    `, [processCode]) : [];

    res.json({ success: true, data: { station, tasks } });
  } catch (error) {
    console.error('[workstation/screen]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 工位屏幕 — 查询工单详情（工序列表+物料+检验记录）
router.get('/screen/:code/:poId', async (req, res) => {
  try {
    const poId = parseInt(req.params.poId);
    const order = await req.db.get(`
      SELECT po.*, p.code as product_code, p.name as product_name, p.specification, p.unit,
             p.outer_diameter, p.inner_diameter, p.wall_thickness, p.length,
             p.tolerance_od, p.tolerance_id, p.tolerance_wt, p.tolerance_len,
             p.tolerance_od_lower, p.tolerance_id_lower, p.tolerance_wt_lower, p.tolerance_len_lower
      FROM production_orders po JOIN products p ON po.product_id = p.id WHERE po.id = ?
    `, [poId]);
    if (!order) return res.status(404).json({ success: false, message: '工单不存在' });

    // 工序记录
    const processRecords = await req.db.all(`
      SELECT ppr.*, pr.name as process_name, pr.code as process_code
      FROM production_process_records ppr
      JOIN processes pr ON ppr.process_id = pr.id
      WHERE ppr.production_order_id = ? ORDER BY pr.sequence
    `, [poId]);

    // 当前工序绑定的物料
    const station = await req.db.get('SELECT process_id FROM workstations WHERE code = ?', [req.params.code]);
    let materials = [];
    if (station?.process_id) {
      const pp = await req.db.get('SELECT id FROM product_processes WHERE product_id = ? AND process_id = ?', [order.product_id, station.process_id]);
      if (pp) {
        materials = await req.db.all(`
          SELECT pm.*, p.code as material_code, p.name as material_name, p.unit as material_unit
          FROM process_materials pm JOIN products p ON pm.material_id = p.id
          WHERE pm.product_process_id = ?
        `, [pp.id]);
      }
    }

    // 最近巡检记录
    const recentInspections = await req.db.all(`
      SELECT pi.*, pr.name as process_name
      FROM patrol_inspections pi
      LEFT JOIN processes pr ON pi.process_id = pr.id
      WHERE pi.production_order_id = ?
      ORDER BY pi.created_at DESC LIMIT 5
    `, [poId]);

    res.json({ success: true, data: { ...order, processRecords, materials, recentInspections } });
  } catch (error) {
    console.error('[workstation/detail]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 工位屏幕 — 快捷报工（免鉴权，需填操作人）
router.post('/screen/:code/:poId/report', async (req, res) => {
  try {
    const { operator, output_quantity, defect_quantity, remark } = req.body;
    if (!operator) return res.status(400).json({ success: false, message: '请填写操作人' });
    if (!output_quantity || output_quantity <= 0) return res.status(400).json({ success: false, message: '产出数量必须大于0' });

    const station = await req.db.get(`SELECT w.*, p.id as pid FROM workstations w LEFT JOIN processes p ON w.process_id = p.id WHERE w.code = ?`, [req.params.code]);
    if (!station?.pid) return res.status(400).json({ success: false, message: '工位未绑定工序' });

    const poId = parseInt(req.params.poId);
    const production = await req.db.get('SELECT * FROM production_orders WHERE id = ?', [poId]);
    if (!production) return res.status(404).json({ success: false, message: '工单不存在' });

    await req.db.transaction(async () => {
      // 更新工序记录
      const record = await req.db.get('SELECT * FROM production_process_records WHERE production_order_id = ? AND process_id = ?', [poId, station.pid]);
      if (record) {
        await req.db.run(`UPDATE production_process_records SET output_quantity = output_quantity + ?, defect_quantity = defect_quantity + ?, operator = ?, status = 'completed', end_time = CURRENT_TIMESTAMP WHERE id = ?`,
          [output_quantity, defect_quantity || 0, operator, record.id]);
      }
      // 更新工单完成数
      await req.db.run('UPDATE production_orders SET completed_quantity = completed_quantity + ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [output_quantity, 'processing', poId]);
    });

    writeLog(req.db, null, '工位报工', 'workstation', poId, `工位 ${req.params.code} 操作人 ${operator} 报工 ${output_quantity}`);
    res.json({ success: true, message: '报工成功' });
  } catch (error) {
    console.error('[workstation/report]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 工位屏幕 — 快捷巡检（免鉴权）
router.post('/screen/:code/:poId/inspect', async (req, res) => {
  try {
    const { inspector, result: inspResult, defect_quantity, remark } = req.body;
    if (!inspector) return res.status(400).json({ success: false, message: '请填写检验员' });
    if (!['pass', 'fail'].includes(inspResult)) return res.status(400).json({ success: false, message: '检验结果无效' });

    const station = await req.db.get(`SELECT w.*, p.id as pid FROM workstations w LEFT JOIN processes p ON w.process_id = p.id WHERE w.code = ?`, [req.params.code]);
    if (!station?.pid) return res.status(400).json({ success: false, message: '工位未绑定工序' });

    const poId = parseInt(req.params.poId);
    const production = await req.db.get('SELECT * FROM production_orders WHERE id = ?', [poId]);
    if (!production) return res.status(404).json({ success: false, message: '工单不存在' });

    const inspNo = generateOrderNo('IPT');
    await req.db.transaction(async () => {
      await req.db.run(`
        INSERT INTO patrol_inspections (inspection_no, production_order_id, process_id, product_id, result, inspector, defect_count, remark)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [inspNo, poId, station.pid, production.product_id, inspResult, inspector, defect_quantity || 0, remark || null]);

      if (inspResult === 'fail') {
        await req.db.run("UPDATE production_orders SET status = 'quality_hold', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'processing'", [poId]);
        const processInfo = await req.db.get('SELECT name FROM processes WHERE id = ?', [station.pid]);
        sendNotification(req.db, null, 'error', '工位巡检不合格',
          `工位 ${station.name} 工单 ${production.order_no} 工序「${processInfo?.name || ''}」巡检未通过`, 'production', poId);
      }
    });

    writeLog(req.db, null, '工位巡检', 'inspection', poId, `工位 ${req.params.code} 检验员 ${inspector} 结果 ${inspResult}`);
    res.json({ success: true, message: inspResult === 'pass' ? '检验通过' : '检验不合格，工单已暂停' });
  } catch (error) {
    console.error('[workstation/inspect]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
