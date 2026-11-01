export function formatCompact(value: number): string {
  if (value < 1000) return String(value)
  const units: Array<[number, string]> = [
    [1_000_000_000, 'b'],
    [1_000_000, 'm'],
    [1_000, 'k']
  ]
  for (const [size, suffix] of units) {
    if (value >= size) {
      const scaled = value / size
      const text = scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(1)
      return `${text.replace(/\.0$/, '')}${suffix}`
    }
  }
  return String(value)
}

export function platformLabel(platform: string): string {
  if (platform === 'tiktok') return 'TikTok'
  if (platform === 'instagram') return 'Instagram'
  if (platform === 'youtube') return 'YouTube'
  return 'Other'
}
