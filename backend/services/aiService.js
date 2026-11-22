const axios = require('axios');

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions';

const VALID_CATEGORIES = [
  '水电故障',
  '门窗故障',
  '网络故障',
  '其他故障'
];

const isAIConfigured = () => Boolean(DEEPSEEK_API_KEY);

const createAuthHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${DEEPSEEK_API_KEY}`
});

const normalizeCategory = (value) => {
  if (!value || typeof value !== 'string') return '其他故障';

  const trimmed = value.replace(/[\r\n\t\s]+/g, '').trim();
  const matched = VALID_CATEGORIES.find((item) => {
    const itemNorm = item.replace(/[\r\n\t\s]+/g, '');
    return trimmed.includes(itemNorm) || itemNorm.includes(trimmed);
  });

  return matched || '其他故障';
};

const parseAnalysis = (value) => {
  if (!value || typeof value !== 'string') return null;

  const jsonText = value
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  try {
    const result = JSON.parse(jsonText);
    if (!result || typeof result !== 'object') return null;

    return {
      category: normalizeCategory(result.category),
      suggestion: typeof result.suggestion === 'string'
        ? result.suggestion.trim().slice(0, 1000)
        : ''
    };
  } catch (error) {
    return null;
  }
};

async function getRepairAnalysis(content) {
  if (!content || !String(content).trim() || !isAIConfigured()) {
    return { category: '其他故障', suggestion: '' };
  }

  try {
    const response = await axios.post(
      DEEPSEEK_API_URL,
      {
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: [
              '你是校园报修助手。根据故障描述进行分类并给出简短、安全的用户自查建议。',
              '只返回合法 JSON 对象，格式为 {"category":"分类","suggestion":"建议"}，不要使用 Markdown。',
              'category 只能是：水电故障、门窗故障、网络故障、其他故障。',
              'suggestion 用中文给出 1 至 3 条非侵入式检查建议，最多 200 字；只允许不拆机、不接触裸露电线、不登高的观察或简单操作。',
              '禁止指导维修、拆卸、触碰电线或带电部件。若描述涉及冒烟、焦味、漏电、漏水或其他危险，建议立即停止使用、远离危险并联系校园维修人员；紧急情况联系校方应急人员。',
              '不要编造设备信息或保证故障原因。'
            ].join('')
          },
          {
            role: 'user',
            content: String(content)
          }
        ],
        temperature: 0,
        max_tokens: 400,
        response_format: { type: 'json_object' }
      },
      {
        headers: createAuthHeaders(),
        timeout: 8000
      }
    );

    const result = response?.data?.choices?.[0]?.message?.content;
    const analysis = parseAnalysis(result);
    if (!analysis) {
      console.error('AI分类和自查建议响应格式无效');
      return { category: '其他故障', suggestion: '' };
    }
    return analysis;
  } catch (error) {
    console.error('AI分类和自查建议请求失败，已降级:', error?.response?.data || error.message || error);
    return { category: '其他故障', suggestion: '' };
  }
}

async function getRepairCategory(content) {
  const analysis = await getRepairAnalysis(content);
  return analysis.category;
}

async function getRepairInsights(metrics) {
  if (!isAIConfigured()) {
    return {
      available: false,
      summary: null,
      observations: [],
      recommendations: []
    };
  }

  try {
    const response = await axios.post(
      DEEPSEEK_API_URL,
      {
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: [
              '你是校园报修运营分析助手。根据匿名统计数据总结工单趋势、突出问题并提出管理建议。',
              '数据中不含个人身份信息。不要推断统计数据未支持的原因或事实。',
              '仅返回合法 JSON：{"summary":"不超过120字","observations":["最多5条，每条不超过80字"],"recommendations":["最多5条，每条不超过80字"]}。'
            ].join('')
          },
          { role: 'user', content: JSON.stringify(metrics) }
        ],
        temperature: 0,
        max_tokens: 500,
        response_format: { type: 'json_object' }
      },
      {
        headers: createAuthHeaders(),
        timeout: 8000
      }
    );
    const content = response?.data?.choices?.[0]?.message?.content;
    const parsed = typeof content === 'string' ? JSON.parse(content) : null;
    if (!parsed || typeof parsed !== 'object' ||
        typeof parsed.summary !== 'string' ||
        !Array.isArray(parsed.observations) ||
        !Array.isArray(parsed.recommendations)) {
      throw new Error('AI运营分析响应格式无效');
    }

    const normalizeList = (items) => items
      .filter((item) => typeof item === 'string' && item.trim())
      .slice(0, 5)
      .map((item) => item.trim().slice(0, 120));

    return {
      available: true,
      summary: parsed.summary.trim().slice(0, 300),
      observations: normalizeList(parsed.observations),
      recommendations: normalizeList(parsed.recommendations)
    };
  } catch (error) {
    console.error('AI运营分析请求失败:', error?.response?.data || error.message || error);
    return {
      available: false,
      summary: null,
      observations: [],
      recommendations: []
    };
  }
}

module.exports = {
  getRepairAnalysis,
  getRepairCategory,
  getRepairInsights,
  isAIConfigured,
  VALID_CATEGORIES
};
