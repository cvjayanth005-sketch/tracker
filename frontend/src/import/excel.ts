import { importDailyLogs } from '@/db/repo'
import { asLocalDate, isLocalDate } from '@/domain/date'
import type { DailyLog, LocalDate } from '@/domain/types'

type Cell = string | number | boolean | Date | null

const CHECKED = new Set(['true', 'yes', 'y', '1', 'checked', 'complete', '\u2611', '\u2713', '\u2714'])

function normalizeHeader(value: Cell): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[\u2610\u2611\u2713\u2714]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function localDate(value: Cell): LocalDate | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getUTCFullYear()
    const m = String(value.getUTCMonth() + 1).padStart(2, '0')
    const d = String(value.getUTCDate()).padStart(2, '0')
    return asLocalDate(`${y}-${m}-${d}`)
  }
  const text = String(value ?? '').trim()
  if (isLocalDate(text)) return text
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (!match) return null
  const [, day, month, year] = match
  const iso = `${year}-${month?.padStart(2, '0')}-${day?.padStart(2, '0')}`
  return isLocalDate(iso) ? iso : null
}

function number(value: Cell): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = Number(String(value ?? '').replace(/,/g, '').trim())
  return Number.isFinite(parsed) && String(value ?? '').trim() !== '' ? parsed : null
}

function checked(value: Cell): boolean {
  if (value === true) return true
  return CHECKED.has(String(value ?? '').trim().toLowerCase())
}

function column(headers: string[], ...names: string[]): number {
  return headers.findIndex((header) => names.some((name) => header === name || header.startsWith(name)))
}

function cell(row: Cell[], index: number): Cell {
  return index >= 0 ? (row[index] ?? null) : null
}

export interface ExcelImportPreview {
  logs: DailyLog[]
  ignoredRows: number
}

export function rowsToDailyLogs(rows: Cell[][]): ExcelImportPreview {
  const headerIndex = rows.findIndex((row) => {
    const headers = row.map(normalizeHeader)
    return headers.includes('date') && headers.some((value) => value.startsWith('weight'))
  })
  if (headerIndex < 0) throw new Error('Could not find Date and Weight columns in this workbook.')

  const headers = (rows[headerIndex] ?? []).map(normalizeHeader)
  const dateCol = column(headers, 'date')
  const weightCol = column(headers, 'weight')
  const caloriesCol = column(headers, 'calories')
  const proteinCol = column(headers, 'protein')
  const stepsCol = column(headers, 'steps')
  const runCol = column(headers, 'run')
  const gymCol = column(headers, 'gym')
  const breakfastCol = column(headers, 'breakfast')
  const lunchCol = column(headers, 'lunch')
  const postWorkoutCol = column(headers, 'post workout', 'postworkout')
  const dinnerCol = column(headers, 'dinner')
  const sleepCol = column(headers, 'sleep')
  const notesCol = column(headers, 'notes')

  const logs: DailyLog[] = []
  let ignoredRows = 0
  for (const row of rows.slice(headerIndex + 1)) {
    const date = localDate(cell(row, dateCol))
    if (!date) {
      ignoredRows += 1
      continue
    }
    const mealValues = [breakfastCol, lunchCol, postWorkoutCol, dinnerCol].map((i) => cell(row, i))
    const hasMealCheck = mealValues.some(checked)
    const stamp = new Date().toISOString()
    logs.push({
      date,
      weightKg: number(cell(row, weightCol)),
      // Numeric cells import as measurements. Checkbox glyphs remain unknown.
      calories: number(cell(row, caloriesCol)),
      proteinG: number(cell(row, proteinCol)),
      carbsG: null,
      fatG: null,
      fiberG: null,
      steps: number(cell(row, stepsCol)),
      runKm: number(cell(row, runCol)),
      gymDone: checked(cell(row, gymCol)) ? true : null,
      mealsOnPlan: hasMealCheck ? mealValues.filter(checked).length : null,
      sleepHours: number(cell(row, sleepCol)) ?? (checked(cell(row, sleepCol)) ? 8 : null),
      energy: null,
      hunger: null,
      soreness: null,
      notes: String(cell(row, notesCol) ?? '').trim() || null,
      createdAt: stamp,
      updatedAt: stamp,
    })
  }
  return { logs, ignoredRows }
}

export async function previewExcel(file: File): Promise<ExcelImportPreview> {
  // Keep the parser out of the initial PWA bundle; it is needed only after the
  // user explicitly chooses an Excel file.
  const { readSheet } = await import('read-excel-file/browser')
  const rows = (await readSheet(file)) as Cell[][]
  return rowsToDailyLogs(rows)
}

export async function importExcel(file: File): Promise<ExcelImportPreview> {
  const preview = await previewExcel(file)
  await importDailyLogs(preview.logs)
  return preview
}
