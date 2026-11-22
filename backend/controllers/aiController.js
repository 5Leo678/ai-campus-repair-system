const { Op, col, fn } = require('sequelize');
const { RepairOrder } = require('../models');
const { getRepairAnalysis, getRepairInsights, isAIConfigured } = require('../services/aiService');
const { recordAdminAction } = require('../services/adminAudit');

const createVisibleOrdersWhere = () => ({
  [Op.and]: [
    { status: { [Op.ne]: '已撤销' } },
    { [Op.or]: [{ deletedAt: null }, { deletedBy: 'student' }] },
    { adminHiddenAt: null }
  ]
});

const analyzeRepairDescription = async (req, res) => {
  if (req.user?.role !== 'student') {
    return res.status(403).json({ code: 403, msg: '只有用户可以使用报修 AI 助手', data: null });
  }
  const description = typeof req.body?.description === 'string'
    ? req.body.description.trim()
    : '';
  if (!description || description.length > 2000) {
    return res.status(400).json({
      code: 400,
      msg: '故障描述为必填项且不能超过2000个字符',
      data: null
    });
  }
  if (!isAIConfigured()) {
    return res.status(503).json({
      code: 503,
      msg: 'AI 分析服务尚未配置，请联系管理员',
      data: null
    });
  }

  try {
    const analysis = await getRepairAnalysis(description);
    if (!analysis.suggestion) {
      return res.status(502).json({ code: 502, msg: 'AI 分析暂时不可用，请稍后重试', data: null });
    }
    return res.status(200).json({ code: 200, msg: 'AI 分析完成', data: analysis });
  } catch (error) {
    console.error('分析用户报修描述失败:', error);
    return res.status(500).json({ code: 500, msg: 'AI 分析失败，请稍后重试', data: null });
  }
};

const getAdminRepairInsights = async (_req, res) => {
  try {
    const where = createVisibleOrdersWhere();
    const [categoryRows, buildingRows, statusRows, total, monthlyCounts] = await Promise.all([
      RepairOrder.findAll({
        attributes: ['aiCategory', [fn('COUNT', col('id')), 'count']],
        where,
        paranoid: false,
        group: ['aiCategory'],
        order: [[fn('COUNT', col('id')), 'DESC']],
        limit: 10,
        raw: true
      }),
      RepairOrder.findAll({
        attributes: ['building', [fn('COUNT', col('id')), 'count']],
        where,
        paranoid: false,
        group: ['building'],
        order: [[fn('COUNT', col('id')), 'DESC']],
        limit: 10,
        raw: true
      }),
      Promise.all(['待处理', '处理中', '已完成'].map(async (status) => [
        status,
        await RepairOrder.count({
          where: { [Op.and]: [...where[Op.and], { status }] },
          paranoid: false
        })
      ])),
      RepairOrder.count({ where, paranoid: false }),
      Promise.all(Array.from({ length: 6 }, async (_, index) => {
        const month = new Date();
        month.setDate(1);
        month.setHours(0, 0, 0, 0);
        month.setMonth(month.getMonth() - (5 - index));
        const nextMonth = new Date(month);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        const count = await RepairOrder.count({
          where: {
            [Op.and]: [
              ...where[Op.and],
              { createdAt: { [Op.gte]: month, [Op.lt]: nextMonth } }
            ]
          },
          paranoid: false
        });
        return {
          month: `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`,
          count
        };
      }))
    ]);

    const metrics = {
      total,
      statusCounts: Object.fromEntries(statusRows),
      categoryCounts: categoryRows.map((row) => ({
        category: row.aiCategory || '未分类',
        count: Number(row.count)
      })),
      buildingCounts: buildingRows.map((row) => ({
        building: row.building || '未填写',
        count: Number(row.count)
      })),
      monthlyCounts
    };
    const analysis = await getRepairInsights(metrics);
    return res.status(200).json({
      code: 200,
      msg: 'AI 工单分析查询成功',
      data: { metrics, ...analysis, generatedAt: new Date().toISOString() }
    });
  } catch (error) {
    console.error('查询 AI 工单分析失败:', error);
    return res.status(500).json({ code: 500, msg: '查询 AI 工单分析失败', data: null });
  }
};

const reanalyzeRepairOrder = async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ code: 403, msg: '只有管理员可以重新分析工单', data: null });
  }
  if (!isAIConfigured()) {
    return res.status(503).json({
      code: 503,
      msg: 'AI 分析服务尚未配置，请联系管理员',
      data: null
    });
  }

  try {
    const order = await RepairOrder.findOne({
      where: { id: req.params.id, adminHiddenAt: null },
      paranoid: false
    });
    if (!order) return res.status(404).json({ code: 404, msg: '工单不存在', data: null });

    const analysis = await getRepairAnalysis(order.desc || order.title);
    if (!analysis.suggestion) {
      return res.status(502).json({ code: 502, msg: 'AI 分析暂时不可用，请稍后重试', data: null });
    }
    await order.update({
      aiCategory: analysis.category,
      aiSuggest: analysis.suggestion
    });
    await recordAdminAction(req.user, 'order.ai.reanalyze', 'order', order.id, {
      category: analysis.category
    });
    return res.status(200).json({
      code: 200,
      msg: '工单 AI 分析已更新',
      data: { id: order.id, aiCategory: order.aiCategory, aiSuggest: order.aiSuggest }
    });
  } catch (error) {
    console.error('重新分析工单失败:', error);
    return res.status(500).json({ code: 500, msg: '重新分析工单失败', data: null });
  }
};

module.exports = {
  analyzeRepairDescription,
  getAdminRepairInsights,
  reanalyzeRepairOrder
};
