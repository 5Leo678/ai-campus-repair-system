const {
  Notification,
  RepairOrder,
  RepairOrderHistory,
  RepairOrderReview,
  User
} = require('../models');
const { Op, fn, col } = require('sequelize');

const STATUS_VALUES = ['待处理', '处理中', '已完成'];

const getOrderStats = async (_req, res) => {
  try {
    const baseWhere = {
      [Op.and]: [
        { status: { [Op.ne]: '已撤销' } },
        { [Op.or]: [{ deletedAt: null }, { deletedBy: 'student' }] },
        { adminHiddenAt: null }
      ]
    };
    const counts = await Promise.all(STATUS_VALUES.map(async (status) => [
      status,
      await RepairOrder.count({
        where: { [Op.and]: [...baseWhere[Op.and], { status }] },
        paranoid: false
      })
    ]));
    const categoryRows = await RepairOrder.findAll({
      attributes: ['aiCategory', [fn('COUNT', col('id')), 'count']],
      where: baseWhere,
      paranoid: false,
      group: ['aiCategory'],
      raw: true
    });
    const locationRows = await RepairOrder.findAll({
      attributes: ['building', [fn('COUNT', col('id')), 'count']],
      where: baseWhere,
      paranoid: false,
      group: ['building'],
      raw: true
    });

    const completedEvents = await RepairOrderHistory.findAll({
      where: { eventType: 'status', status: '已完成' },
      attributes: ['orderId', 'createdAt'],
      raw: true
    });
    const orderIds = [...new Set(completedEvents.map((event) => event.orderId))];
    const finishedOrders = orderIds.length
      ? await RepairOrder.findAll({
        where: { id: { [Op.in]: orderIds } },
        attributes: ['id', 'createdAt'],
        paranoid: false,
        raw: true
      })
      : [];
    const createdAtById = new Map(finishedOrders.map((order) => [
      String(order.id),
      new Date(order.createdAt).getTime()
    ]));
    const firstCompletionByOrder = new Map();
    for (const event of completedEvents) {
      const key = String(event.orderId);
      const time = new Date(event.createdAt).getTime();
      if (!firstCompletionByOrder.has(key) || time < firstCompletionByOrder.get(key)) {
        firstCompletionByOrder.set(key, time);
      }
    }
    const completionDurations = [...firstCompletionByOrder.entries()]
      .map(([orderId, completedAt]) => completedAt - createdAtById.get(orderId))
      .filter((duration) => Number.isFinite(duration) && duration >= 0);

    const statusCounts = Object.fromEntries(counts);
    return res.status(200).json({
      code: 200,
      msg: '统计查询成功',
      data: {
        total: Object.values(statusCounts).reduce((total, count) => total + count, 0),
        statusCounts,
        categories: categoryRows.map((row) => ({
          category: row.aiCategory || '未分类',
          count: Number(row.count)
        })),
        locations: locationRows.map((row) => ({
          building: row.building || '未填写',
          count: Number(row.count)
        })),
        averageResolutionHours: completionDurations.length
          ? Number((completionDurations.reduce((sum, duration) => sum + duration, 0) /
            completionDurations.length / 3600000).toFixed(1))
          : null
      }
    });
  } catch (error) {
    console.error('查询工单统计失败:', error);
    return res.status(500).json({
      code: 500,
      msg: '查询工单统计失败',
      data: null
    });
  }
};

const getMyNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const [list, unreadCount] = await Promise.all([
      Notification.findAll({
        where: { userId },
        include: [{
          model: RepairOrder,
          as: 'order',
          attributes: ['id', 'title']
        }],
        order: [['createdAt', 'DESC']],
        limit: 100
      }),
      Notification.count({ where: { userId, readAt: null } })
    ]);

    return res.status(200).json({
      code: 200,
      msg: '通知查询成功',
      data: { list, unreadCount }
    });
  } catch (error) {
    console.error('查询本人通知失败:', error);
    return res.status(500).json({
      code: 500,
      msg: '查询通知失败',
      data: null
    });
  }
};

const markNotificationRead = async (req, res) => {
  try {
    const [updatedCount] = await Notification.update(
      { readAt: new Date() },
      { where: { id: req.params.id, userId: req.user.id, readAt: null } }
    );
    if (!updatedCount) {
      const notification = await Notification.findOne({
        where: { id: req.params.id, userId: req.user.id }
      });
      if (!notification) {
        return res.status(404).json({
          code: 404,
          msg: '通知不存在',
          data: null
        });
      }
      return res.status(200).json({
        code: 200,
        msg: '通知已读',
        data: notification
      });
    }

    return res.status(200).json({
      code: 200,
      msg: '通知已读',
      data: null
    });
  } catch (error) {
    console.error('标记通知已读失败:', error);
    return res.status(500).json({
      code: 500,
      msg: '更新通知状态失败',
      data: null
    });
  }
};

const createOrderReview = async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({
        code: 403,
        msg: '只有用户可以评价本人已完成的工单',
        data: null
      });
    }

    const { rating, comment = '', feedbackType = null } = req.body || {};
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({
        code: 400,
        msg: '评分必须为1至5的整数',
        data: null
      });
    }
    if (typeof comment !== 'string' || comment.trim().length > 1000) {
      return res.status(400).json({
        code: 400,
        msg: '评价内容不能超过1000个字符',
        data: null
      });
    }
    const feedbackTypes = ['quality', 'communication', 'speed', 'result', 'other'];
    if (feedbackType !== null && !feedbackTypes.includes(feedbackType)) {
      return res.status(400).json({
        code: 400,
        msg: '评价类型无效',
        data: null
      });
    }

    const order = await RepairOrder.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!order) {
      return res.status(404).json({
        code: 404,
        msg: '工单不存在',
        data: null
      });
    }
    if (order.status !== '已完成') {
      return res.status(409).json({
        code: 409,
        msg: '仅已完成工单可以评价',
        data: null
      });
    }

    const [review, created] = await RepairOrderReview.findOrCreate({
      where: { orderId: order.id },
      defaults: {
        userId: req.user.id,
        rating,
        comment: comment.trim() || null,
        feedbackType
      }
    });
    if (!created) {
      return res.status(409).json({
        code: 409,
        msg: '该工单已经评价，每单只能评价一次',
        data: null
      });
    }

    return res.status(201).json({
      code: 201,
      msg: '评价提交成功',
      data: review
    });
  } catch (error) {
    console.error('提交工单评价失败:', error);
    return res.status(500).json({
      code: 500,
      msg: '提交评价失败',
      data: null
    });
  }
};

const getAdminOrderReviews = async (req, res) => {
  try {
    const rawPage = req.query.page ?? '1';
    const rawSize = req.query.size ?? '10';
    const page = Number(rawPage);
    const size = Number(rawSize);
    if (!Number.isInteger(page) || !Number.isInteger(size) ||
        page < 1 || size < 1 || size > 100) {
      return res.status(400).json({
        code: 400,
        msg: 'page必须为正整数，size必须为1至100',
        data: null
      });
    }
    const rawKeyword = req.query.q ?? '';
    if (typeof rawKeyword !== 'string' || rawKeyword.trim().length > 100) {
      return res.status(400).json({
        code: 400,
        msg: '搜索关键词不能超过100个字符',
        data: null
      });
    }
    const keyword = rawKeyword.trim();
    const reviewWhere = keyword
      ? {
        [Op.or]: [
          { comment: { [Op.like]: `%${keyword}%` } },
          { adminFollowup: { [Op.like]: `%${keyword}%` } },
          { feedbackType: { [Op.like]: `%${keyword}%` } },
          { '$order.title$': { [Op.like]: `%${keyword}%` } },
          { '$order.location$': { [Op.like]: `%${keyword}%` } },
          { '$order.phone$': { [Op.like]: `%${keyword}%` } },
          { '$user.nickname$': { [Op.like]: `%${keyword}%` } },
          { '$user.phone$': { [Op.like]: `%${keyword}%` } }
        ]
      }
      : {};
    const reviewIncludes = [
      {
        model: RepairOrder,
        as: 'order',
        attributes: ['id', 'title', 'location', 'phone', 'status'],
        where: { status: '已完成' },
        required: true
      },
      {
        model: User,
        as: 'user',
        attributes: ['id', 'nickname', 'phone'],
        required: false
      }
    ];

    const [{ count, rows }, ratings, lowRatingCount] = await Promise.all([
      RepairOrderReview.findAndCountAll({
        where: reviewWhere,
        include: reviewIncludes,
        order: [['createdAt', 'DESC']],
        limit: size,
        offset: (page - 1) * size,
        distinct: true
      }),
      RepairOrderReview.findAll({
        where: reviewWhere,
        attributes: ['rating'],
        include: reviewIncludes,
        raw: true
      }),
      RepairOrderReview.count({
        where: keyword
          ? { [Op.and]: [reviewWhere, { rating: { [Op.lte]: 2 } }] }
          : { rating: { [Op.lte]: 2 } },
        include: reviewIncludes,
        distinct: true
      })
    ]);
    const averageRating = ratings.length
      ? Number((ratings.reduce((sum, item) => sum + Number(item.rating), 0) / ratings.length).toFixed(1))
      : 0;

    return res.status(200).json({
      code: 200,
      msg: '工单评价查询成功',
      data: {
        list: rows,
        total: count,
        page,
        size,
        totalPage: Math.ceil(count / size),
        averageRating,
        lowRatingCount
      }
    });
  } catch (error) {
    console.error('查询管理员工单评价失败:', error);
    return res.status(500).json({
      code: 500,
      msg: '查询工单评价失败',
      data: null
    });
  }
};

module.exports = {
  getOrderStats,
  getMyNotifications,
  markNotificationRead,
  createOrderReview,
  getAdminOrderReviews
};
