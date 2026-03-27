import type { HarnessRole, HarnessGroupStatus } from '../../types';

interface ConnectionLineProps {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  fromRole: HarnessRole;
  toRole: HarnessRole;
  groupStatus: HarnessGroupStatus;
  isRework?: boolean;
}

const ROLE_COLORS: Record<string, string> = {
  'planner-generator': '#3b82f6',
  'planner-evaluator': '#3b82f6',
  'generator-evaluator': '#f97316',
  'evaluator-generator': '#ef4444',
};

function getColor(fromRole: HarnessRole, toRole: HarnessRole, isRework?: boolean): string {
  if (isRework) return ROLE_COLORS['evaluator-generator'];
  return ROLE_COLORS[`${fromRole}-${toRole}`] || '#6b7280';
}

function isDashed(fromRole: HarnessRole, toRole: HarnessRole): boolean {
  return fromRole === 'planner' && toRole === 'evaluator';
}

export function ConnectionLine({
  fromX, fromY, toX, toY,
  fromRole, toRole,
  groupStatus,
  isRework,
}: ConnectionLineProps) {
  const color = getColor(fromRole, toRole, isRework);
  const dashed = isDashed(fromRole, toRole);
  const isRunning = groupStatus === 'running';

  const dx = toX - fromX;
  const cx1 = fromX + dx * 0.4;
  const cy1 = fromY;
  const cx2 = toX - dx * 0.4;
  const cy2 = toY;

  const pathD = `M ${fromX} ${fromY} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${toX} ${toY}`;

  const angle = Math.atan2(toY - cy2, toX - cx2);
  const arrowLen = 8;
  const arrow1X = toX - arrowLen * Math.cos(angle - Math.PI / 6);
  const arrow1Y = toY - arrowLen * Math.sin(angle - Math.PI / 6);
  const arrow2X = toX - arrowLen * Math.cos(angle + Math.PI / 6);
  const arrow2Y = toY - arrowLen * Math.sin(angle + Math.PI / 6);

  const labelX = (fromX + toX) / 2;
  const labelY = (fromY + toY) / 2 - 10;
  const label = `${fromRole[0].toUpperCase()}→${toRole[0].toUpperCase()}`;

  return (
    <g>
      <path d={pathD} fill="none" stroke={color} strokeWidth={2}
        strokeDasharray={dashed ? '6 4' : undefined} opacity={0.8} />
      {isRunning && (
        <path d={pathD} fill="none" stroke={color} strokeWidth={2}
          strokeDasharray="4 8" opacity={0.6}>
          <animate attributeName="stroke-dashoffset" from="12" to="0" dur="1s" repeatCount="indefinite" />
        </path>
      )}
      <polygon points={`${toX},${toY} ${arrow1X},${arrow1Y} ${arrow2X},${arrow2Y}`}
        fill={color} opacity={0.8} />
      <text x={labelX} y={labelY} textAnchor="middle" fill={color}
        fontSize={10} fontWeight={500} className="select-none pointer-events-none">
        {label}
      </text>
    </g>
  );
}
