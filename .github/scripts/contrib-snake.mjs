// Builds an animated contribution snake for the last four months.
// Usage: GITHUB_TOKEN=... GH_USER=... node contrib-snake.mjs <out-dir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const user = process.env.GH_USER;
const token = process.env.GITHUB_TOKEN;
const outDir = process.argv[2] ?? 'dist';
const MONTHS_SHOWN = 4;

const C = {
  card: '#191816', border: '#37332e', text: '#ede7dd', muted: '#a59e93',
  empty: '#2d2a26', levels: ['#43523f', '#5f7a55', '#82a275', '#a9c69b'],
  snake: '#d9b26f',
};
const MONO = "ui-monospace,SFMono-Regular,'Cascadia Code',Consolas,'Liberation Mono',Menlo,monospace";
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans',Helvetica,Arial,sans-serif";
const LEVEL = { FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

async function fetchWeeks() {
  const to = new Date();
  const from = new Date(to);
  from.setUTCMonth(from.getUTCMonth() - MONTHS_SHOWN);
  from.setUTCDate(from.getUTCDate() - from.getUTCDay());
  from.setUTCHours(0, 0, 0, 0);
  const query = `query($login:String!,$from:DateTime!,$to:DateTime!){user(login:$login){contributionsCollection(from:$from,to:$to){contributionCalendar{totalContributions weeks{contributionDays{date weekday contributionCount contributionLevel}}}}}}`;
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': user },
    body: JSON.stringify({ query, variables: { login: user, from: from.toISOString(), to: to.toISOString() } }),
  });
  const body = await res.json();
  if (!res.ok || body.errors) throw new Error(JSON.stringify(body.errors ?? body));
  return body.data.user.contributionsCollection.contributionCalendar;
}

function render({ totalContributions, weeks }) {
  const cols = weeks.length;
  const left = 56, top = 84, right = 28, bottom = 28;
  const W = 860;
  const pitch = Math.min(46, Math.floor((W - left - right) / cols));
  const size = pitch - 8;
  const H = top + 7 * pitch + bottom;
  const center = (c, r) => [left + c * pitch + size / 2, top + r * pitch + size / 2];

  const order = [];
  weeks.forEach((w, c) => {
    const rows = [...Array(7).keys()];
    (c % 2 ? rows.reverse() : rows).forEach((r) => order.push([c, r]));
  });
  const steps = order.length;
  const stepDur = 0.085;
  const travel = steps * stepDur;
  const dur = +(travel / 0.85).toFixed(2);
  const pathD = order.map(([c, r], i) => `${i ? 'L' : 'M'}${center(c, r).map((v) => v.toFixed(1)).join(' ')}`).join(' ');
  const indexOf = new Map(order.map(([c, r], i) => [`${c},${r}`, i]));

  let cells = '';
  let monthLabels = '';
  let lastMonth = -1;
  weeks.forEach((w, c) => {
    const firstDay = new Date(`${w.contributionDays[0].date}T00:00:00Z`);
    if (firstDay.getUTCMonth() !== lastMonth && (c > 0 || firstDay.getUTCDate() <= 7)) {
      lastMonth = firstDay.getUTCMonth();
      monthLabels += `<text x="${left + c * pitch}" y="${top - 12}" class="mono" font-size="13" fill="${C.muted}">${MONTH_NAMES[lastMonth]}</text>`;
    } else if (c === 0) {
      lastMonth = firstDay.getUTCMonth();
    }
    for (const d of w.contributionDays) {
      const level = LEVEL[d.contributionLevel] ?? 0;
      const x = left + c * pitch;
      const y = top + d.weekday * pitch;
      const fill = level ? C.levels[level - 1] : C.empty;
      const eatAt = ((indexOf.get(`${c},${d.weekday}`) * stepDur) / dur).toFixed(4);
      const anim = level
        ? `<animate attributeName="fill" values="${fill};${C.empty}" keyTimes="0;${eatAt}" calcMode="discrete" dur="${dur}s" repeatCount="indefinite"/>`
        : '';
      cells += `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="7" fill="${fill}">${anim}</rect>`;
    }
  });

  const segments = [1, 0.86, 0.74, 0.64, 0.56].map((scale, k) => {
    const s = (size * 0.78 * scale).toFixed(1);
    return `<rect x="${-s / 2}" y="${-s / 2}" width="${s}" height="${s}" rx="${(s / 3).toFixed(1)}" fill="${C.snake}" opacity="${(1 - k * 0.15).toFixed(2)}" visibility="hidden">
    <set attributeName="visibility" to="visible" begin="${(k * stepDur).toFixed(3)}s"/>
    <animateMotion path="${pathD}" keyPoints="0;1;1" keyTimes="0;0.85;1" calcMode="linear" dur="${dur}s" begin="${(k * stepDur).toFixed(3)}s" repeatCount="indefinite"/>
  </rect>`;
  }).reverse().join('\n  ');

  const first = weeks[0].contributionDays[0].date;
  const lastWeek = weeks[weeks.length - 1].contributionDays;
  const last = lastWeek[lastWeek.length - 1].date;
  const fmt = (iso) => { const d = new Date(`${iso}T00:00:00Z`); return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}`; };
  const dayLabels = [[1, 'Mon'], [3, 'Wed'], [5, 'Fri']]
    .map(([r, t]) => `<text x="${left - 12}" y="${top + r * pitch + size / 2 + 4}" class="mono" font-size="12" fill="${C.muted}" text-anchor="end">${t}</text>`).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${totalContributions} contributions in the last ${MONTHS_SHOWN} months">
<title>${totalContributions} contributions in the last ${MONTHS_SHOWN} months</title>
<style>.mono{font-family:${MONO}}.sans{font-family:${SANS}}</style>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="14" fill="${C.card}" stroke="${C.border}"/>
<text x="28" y="40" class="sans" font-size="18" font-weight="700" fill="${C.text}">Last ${MONTHS_SHOWN} Months</text>
<text x="${W - 28}" y="40" class="mono" font-size="13" fill="${C.muted}" text-anchor="end"><tspan fill="${C.snake}" font-weight="700">${totalContributions}</tspan> contributions · ${fmt(first)} to ${fmt(last)}</text>
${monthLabels}
${dayLabels}
${cells}
  ${segments}
</svg>
`;
}

const calendar = await fetchWeeks();
const svg = render(calendar);
mkdirSync(outDir, { recursive: true });
for (const name of ['snake-dark.svg', 'snake-light.svg']) writeFileSync(join(outDir, name), svg);
console.log(`wrote snake for ${calendar.totalContributions} contributions across ${calendar.weeks.length} weeks`);
