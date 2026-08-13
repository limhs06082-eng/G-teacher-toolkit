/**
 * 문장 다듬기 (Vercel 서버리스 함수).
 *
 * 원본 G-school-message-templates는 express 서버(server.ts)로 이 일을 했다.
 * Vercel에서는 서버를 상주시킬 수 없어 함수로 옮겼다.
 *
 * **환경변수를 요구하지 않는다.** 키는 요청 본문으로 받는다.
 * fork 직후 설정 없이 배포되어야 한다는 원칙 때문이다.
 * AI 다듬기는 선택 기능이고, 키가 없으면 그 버튼만 숨는다.
 */

const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const TONE_GUIDE: Record<string, string> = {
  plain: '담백하고 간결하게',
  polite: '정중하고 부드럽게',
  formal: '공식 문서에 어울리게 격식을 갖추어',
};

const LENGTH_GUIDE: Record<string, string> = {
  short: '두세 문장으로 짧게',
  normal: '지금 분량을 크게 벗어나지 않게',
  detailed: '필요한 안내를 빠짐없이 담아 조금 더 자세히',
};

interface RefineBody {
  text?: unknown;
  apiKey?: unknown;
  tone?: unknown;
  length?: unknown;
}

function badRequest(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST만 받습니다.' }), {
      status: 405,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  let body: RefineBody;
  try {
    body = (await request.json()) as RefineBody;
  } catch {
    return badRequest('요청 형식이 올바르지 않습니다.');
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';

  if (text === '') return badRequest('다듬을 문구가 비어 있습니다.');
  if (apiKey === '') {
    return badRequest('Gemini API 키가 없습니다. 설정 화면에서 키를 넣어 주세요.');
  }

  const tone = TONE_GUIDE[typeof body.tone === 'string' ? body.tone : 'polite'] ?? TONE_GUIDE['polite'];
  const length =
    LENGTH_GUIDE[typeof body.length === 'string' ? body.length : 'normal'] ?? LENGTH_GUIDE['normal'];

  const prompt = [
    '당신은 초·중·고 교사가 학부모와 교직원에게 보내는 안내 문구를 다듬는 일을 돕습니다.',
    `다음 문구를 ${tone}, ${length} 고쳐 주세요.`,
    '',
    '지켜야 할 것:',
    '- 사실을 새로 만들어 내지 마세요. 없는 날짜·장소·준비물을 지어내면 안 됩니다.',
    '- {학교} {학년} 처럼 중괄호로 감싼 자리표시자는 그대로 두세요.',
    '- 결과 문구만 답하세요. 설명이나 인사말을 덧붙이지 마세요.',
    '',
    '원본 문구:',
    text,
  ].join('\n');

  try {
    const response = await fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    if (!response.ok) {
      // 키가 틀렸는지 한도를 넘겼는지는 교사가 알아야 대응할 수 있다.
      const detail = response.status === 400 || response.status === 403
        ? 'API 키가 올바른지 확인해 주세요.'
        : response.status === 429
          ? '요청이 많아 잠시 후 다시 시도해 주세요.'
          : 'Gemini 응답을 받지 못했습니다.';

      return new Response(JSON.stringify({ error: detail }), {
        status: 502,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }

    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const refined = payload.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
    if (refined === '') {
      return new Response(JSON.stringify({ error: '다듬은 결과가 비어 있습니다.' }), {
        status: 502,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }

    return new Response(JSON.stringify({ text: refined }), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  } catch {
    return new Response(JSON.stringify({ error: '네트워크 오류로 다듬지 못했습니다.' }), {
      status: 502,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }
}
