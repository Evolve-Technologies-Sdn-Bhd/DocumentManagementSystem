import React from 'react'
import { Doughnut } from 'react-chartjs-2'
import { ArcElement, Chart as ChartJS, Tooltip } from 'chart.js'
import AppSurface from '../ui/AppSurface'
import SectionHeader from '../ui/SectionHeader'
import EmptyPanelState from '../ui/EmptyPanelState'

ChartJS.register(ArcElement, Tooltip)

export default function DashboardStatusChart({
  title,
  subtitle,
  items,
  totalLabel,
  emptyTitle,
  emptyDescription
}) {
  const total = items.reduce((sum, item) => sum + item.value, 0)

  const chartData = {
    labels: items.map((item) => item.label),
    datasets: [
      {
        data: items.map((item) => item.value),
        backgroundColor: items.map((item) => item.color),
        borderWidth: 0,
        hoverOffset: 6
      }
    ]
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '72%',
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => `${context.label}: ${context.raw}`
        }
      }
    }
  }

  return (
    <AppSurface padding="lg" className="space-y-4">
      <SectionHeader title={title} subtitle={subtitle} />

      {total > 0 ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-center">
          <div className="relative mx-auto h-[220px] w-[220px]">
            <Doughnut data={chartData} options={chartOptions} />
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">{totalLabel}</div>
              <div className="mt-1 text-3xl font-semibold leading-none text-ink">{total}</div>
            </div>
          </div>

          <div className="space-y-3">
            {items.map((item) => {
              const percentage = total > 0 ? Math.round((item.value / total) * 100) : 0

              return (
                <div key={item.key} className="rounded-2xl border border-border bg-surface-muted p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="truncate text-sm font-medium text-ink-secondary">{item.label}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-ink">{item.value}</div>
                      <div className="text-[11px] text-ink-muted">{percentage}%</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <EmptyPanelState title={emptyTitle} description={emptyDescription} />
      )}
    </AppSurface>
  )
}
