import { LineChart, Line, ResponsiveContainer } from 'recharts';

interface MiniSparklineProps {
  data: number[];
  positive: boolean;
}

const MiniSparkline = ({ data, positive }: MiniSparklineProps) => {
  const chartData = data.map((v) => ({ v }));
  const color = positive ? 'hsl(var(--success))' : 'hsl(var(--destructive))';

  return (
    <ResponsiveContainer width={80} height={24}>
      <LineChart data={chartData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <Line
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

export default MiniSparkline;
